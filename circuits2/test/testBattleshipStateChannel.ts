const { expect } = require("chai");
const hre = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const { GameStateChannel } = require("./helpers/GameStateChannel");
const fs = require("fs");
const path = require("path");
const verificationKeyJson = require("../keys/ship_verification_key.json");

describe("BattleshipStateChannelGame - Advanced End-to-End Tests", function () {
  // Increase timeout for zk proof generation
  this.timeout(120000);

  // Helper function to create realistic game state
  function createGameState(options = {}) {
    const defaults = {
      stateHash: hre.ethers.ZeroHash,
      nonce: 1,
      currentTurn: hre.ethers.ZeroAddress,
      moveCount: 0,
      player1ShipCommitment: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("player1_ships")),
      player2ShipCommitment: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("player2_ships")),
      player1Hits: 0,
      player2Hits: 0,
      gameEnded: false,
      winner: hre.ethers.ZeroAddress,
      timestamp: Math.floor(Date.now() / 1000)
    };
    
    return { ...defaults, ...options };
  }

  async function signGameState(gameState: any, signer: any) {
    const stateHash = hre.ethers.keccak256(hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(bytes32,uint256,address,uint256,bytes32,bytes32,uint8,uint8,bool,address,uint256)"],
      [[
        gameState.stateHash,
        gameState.nonce,
        gameState.currentTurn,
        gameState.moveCount,
        gameState.player1ShipCommitment,
        gameState.player2ShipCommitment,
        gameState.player1Hits,
        gameState.player2Hits,
        gameState.gameEnded,
        gameState.winner,
        gameState.timestamp
      ]]
    ));
    
    return await signer.signMessage(hre.ethers.getBytes(stateHash));
  }


  async function deployBattleshipFixture() {
    const [owner, player1, player2, player3] = await hre.ethers.getSigners();
    
    const shipPlacementVerifier = await hre.ethers.deployContract("ShipPlacementVerifier");
    const moveVerifier = await hre.ethers.deployContract("MoveVerifier");
    const winVerifier = await hre.ethers.deployContract("WinVerifier");

    await shipPlacementVerifier.waitForDeployment();
    await moveVerifier.waitForDeployment();
    await winVerifier.waitForDeployment();
    
    const BattleshipWaku = await hre.ethers.getContractFactory("BattleshipStateChannel");
    const battleshipWaku = await hre.upgrades.deployProxy(BattleshipWaku, [
      shipPlacementVerifier.target, 
      moveVerifier.target, 
      winVerifier.target
    ], { 
      initializer: "initialize", 
      kind: "uups" 
    });
    
    await battleshipWaku.waitForDeployment();
    console.log("BattleshipWaku deployed to:", battleshipWaku.target);
    
    const gameStateChannel = new GameStateChannel("387", player1, 31337, battleshipWaku.target);
    await gameStateChannel.initialize();

    const gameStateChannel2 = new GameStateChannel("387", player2, 31337, battleshipWaku.target);
    await gameStateChannel2.initialize();

    return { 
      shipPlacementVerifier, 
      moveVerifier, 
      winVerifier, 
      owner, 
      battleshipWaku, 
      player1, 
      player2, 
      player3, 
      gameStateChannel,
      gameStateChannel2 
    };
  }

  describe("Contract Deployment and Initialization", function () {
    it("Should deploy all contracts successfully", async function () {
      const { shipPlacementVerifier, moveVerifier, winVerifier, battleshipWaku } = await loadFixture(deployBattleshipFixture);

      expect(shipPlacementVerifier.target).to.not.equal(0);
      expect(moveVerifier.target).to.not.equal(0);
      expect(winVerifier.target).to.not.equal(0);
      expect(battleshipWaku.target).to.not.equal(0);
    });

    it("Should initialize with correct verifier addresses and constants", async function () {
      const { shipPlacementVerifier, moveVerifier, winVerifier, battleshipWaku } = await loadFixture(deployBattleshipFixture);

      expect(await battleshipWaku.shipPlacementVerifier()).to.equal(shipPlacementVerifier.target);
      expect(await battleshipWaku.moveVerifier()).to.equal(moveVerifier.target);
      expect(await battleshipWaku.winVerifier()).to.equal(winVerifier.target);
      expect(await battleshipWaku.CHALLENGE_PERIOD()).to.equal(300); // 5 minutes
      expect(await battleshipWaku.RESPONSE_PERIOD()).to.equal(120); // 2 minutes
      expect(await battleshipWaku.MAX_MOVES()).to.equal(100);
    });
  });

  describe("Channel Opening and Setup", function () {
    it("Should successfully open a channel between two players", async function () {
      const { battleshipWaku, player1, player2 } = await loadFixture(deployBattleshipFixture);

      await expect(battleshipWaku.connect(player1).openChannel(player2.address))
        .to.emit(battleshipWaku, "ChannelOpened")
        .withArgs(1, player1.address, player2.address);

      const channel = await battleshipWaku.getChannel(1);
      expect(channel[0]).to.equal(1); // channelId
      expect(channel[1]).to.equal(player1.address); // player1
      expect(channel[2]).to.equal(player2.address); // player2
      expect(channel[3]).to.equal(0); // ChannelStatus.Open
    });

    it("Should reject invalid player addresses", async function () {
      const { battleshipWaku, player1 } = await loadFixture(deployBattleshipFixture);

      await expect(battleshipWaku.connect(player1).openChannel(hre.ethers.ZeroAddress))
        .to.be.revertedWith("Invalid player addresses");
    });

    it("Should handle multiple channels with correct ID increment", async function () {
      const { battleshipWaku, player1, player2, player3 } = await loadFixture(deployBattleshipFixture);

      await battleshipWaku.connect(player1).openChannel(player2.address);
      await battleshipWaku.connect(player2).openChannel(player3.address);

      const channel1 = await battleshipWaku.getChannel(1);
      const channel2 = await battleshipWaku.getChannel(2);

      expect(channel1[0]).to.equal(1);
      expect(channel2[0]).to.equal(2);
      expect(await battleshipWaku.nextChannelId()).to.equal(3);
    });
  });

  describe("Initial State Submission with Real Ship Placements", function () {
    it("Should allow both players to submit valid initial states", async function () {
        const { battleshipWaku, player1, player2, gameStateChannel, shipPlacementVerifier, gameStateChannel2 } = await loadFixture(deployBattleshipFixture);

        // Here is the assumption is that both players have sent ready state.

        let shipPlacementPositionsPlayer1 = null, shipPlacementPositionsPlayer2 = null, shipPositions1 = null, shipPositions2 = null;
        while (true) {
            shipPositions1 = gameStateChannel.generateRandomShipPositions();
            shipPlacementPositionsPlayer1 = await gameStateChannel.generateShipPlacementPositions(shipPositions1);
            const isValid = gameStateChannel.validateInput(shipPlacementPositionsPlayer1.ships, shipPlacementPositionsPlayer1.board_state)
            console.log("isValid", isValid);
            if (isValid) {
                break;
            }
        }
        console.log("shipPlacementPositionsPlayer1: ", shipPlacementPositionsPlayer1);
        while (true) {
            shipPositions2 = gameStateChannel2.generateRandomShipPositions();
            shipPlacementPositionsPlayer2 = await gameStateChannel2.generateShipPlacementPositions(shipPositions2);
            if (gameStateChannel2.validateInput(shipPlacementPositionsPlayer2.ships, shipPlacementPositionsPlayer2.board_state)) {
                break;
            }
        }
        console.log("shipPlacementPositionsPlayer2:", shipPlacementPositionsPlayer2);

        const wasmPath = path.join(__dirname, "..", "build", "ship_placement", "ship_placement_js", "ship_placement.wasm");
        const zkeyPath = path.join(__dirname, "..", "keys", "ship_placement_final.zkey");
        const verificationKeyPath = path.join(__dirname, "..", "keys", "ship_verification_key.json");
        if (!fs.existsSync(wasmPath)) {
            throw new Error(`WASM file not found at: ${wasmPath}`);
        }
        
        if (!fs.existsSync(zkeyPath)) {
            throw new Error(`zkey file not found at: ${zkeyPath}`);
        }
        if (!fs.existsSync(verificationKeyPath)) {
            throw new Error(`verification file not found at: ${verificationKeyPath}`);
        }
        console.log("wasmPath", wasmPath);
        console.log("zkeyPath", zkeyPath);
        console.log("verificationKeyPath", verificationKeyPath);

        const verification = fs.readFileSync(verificationKeyPath);
        // const wasmBuffer = fs.readFileSync(wasmPath);
        // const zkeyBuffer = fs.readFileSync(zkeyPath);
        // console.log("WASM buffer size:", wasmBuffer.length);
        // console.log("zkey buffer size:", zkeyBuffer.length);
        console.log("--");

        const {proof: proofPlayer1, calldata: calldataPlayer1} = await gameStateChannel.generateProof(shipPlacementPositionsPlayer1, wasmPath, zkeyPath);
        // console.log(proofPlayer1);
        const proofPlayer1_converted = {
            pA: calldataPlayer1[0],
            pB: calldataPlayer1[1],
            pC: calldataPlayer1[2],
            pubSignals: calldataPlayer1[3]
        };
        
        let offchainVerification = await gameStateChannel.verifyProof(verificationKeyJson, proofPlayer1);
        console.log("Offchain verification proof", offchainVerification);
        
        let result = await shipPlacementVerifier.verifyProof(proofPlayer1_converted.pA, proofPlayer1_converted.pB, proofPlayer1_converted.pC, proofPlayer1_converted.pubSignals);
        

        const player1_gameState = await gameStateChannel.generateShipPlacementProof(proofPlayer1_converted, shipPlacementPositionsPlayer1.ships, shipPlacementPositionsPlayer1.board_state, shipPlacementPositionsPlayer1.salt, shipPlacementPositionsPlayer1.commitment, shipPlacementPositionsPlayer1.merkle_root);

        const {proof: _proofPlayer2, calldata: proofPlayer2} = await gameStateChannel2.generateProof(shipPlacementPositionsPlayer2, wasmPath, zkeyPath);
        const proofPlayer2_converted = {
          pA: proofPlayer2[0],
          pB: proofPlayer2[1],
          pC: proofPlayer2[2],
          pubSignals: proofPlayer2[3]
        };
        let result2 = await shipPlacementVerifier.verifyProof(proofPlayer2_converted.pA, proofPlayer2_converted.pB, proofPlayer2_converted.pC, proofPlayer2_converted.pubSignals);
        console.log("result2", result2);

        const player2_gameState = await gameStateChannel2.generateShipPlacementProof(proofPlayer2_converted, shipPlacementPositionsPlayer2.ships, shipPlacementPositionsPlayer2.board_state, shipPlacementPositionsPlayer2.salt, shipPlacementPositionsPlayer2.commitment, shipPlacementPositionsPlayer2.merkle_root);
        
        const stateSignature_createGame = await gameStateChannel.createGame(
          "1",
          "333",
          player1.address,
          player1_gameState.commitment,
          player1_gameState.merkleRoot,
          player1_gameState.player1ShipPlacementProof,
          player2.address,
          player2_gameState.commitment,
          player2_gameState.merkleRoot,
          player2_gameState.player2ShipPlacementProof
        );

        if (stateSignature_createGame === "") {
            throw new Error("Game creation failed");
        }

        const stateSignature_createGame2 = await gameStateChannel2.createGame(
          "1",
          "333",
          player1.address,
          player1_gameState.commitment,
          player1_gameState.merkleRoot,
          player1_gameState.player1ShipPlacementProof,
          player2.address,
          player2_gameState.commitment,
          player2_gameState.merkleRoot,
          player2_gameState.player2ShipPlacementProof
        );

        if (stateSignature_createGame2 === "") {
            throw new Error("Game creation failed");
        }

        // Open channel
        const tx = await battleshipWaku.connect(player1).openChannel(player2.address);
        const receipt = await tx.wait();
        // Method 1: Get channelId from event logs
        const channelOpenedEvent = receipt.logs.find((log: any) => {
            try {
                const parsed = battleshipWaku.interface.parseLog(log);
                return parsed?.name === 'ChannelOpened';
            } catch {
                return false;
            }
        });
        
        const channelId = channelOpenedEvent ? 
            battleshipWaku.interface.parseLog(channelOpenedEvent).args.channelId : 
            null;
        
        console.log("Channel opened with id ", channelId);    
        const game = await gameStateChannel.getGameState();
        const game_converted = {
          nonce: game.nonce,
          currentTurn: game.currentTurn,
          moveCount: game.moveCount,
          player1ShipCommitment: game.player1ShipCommitment,
          player2ShipCommitment: game.player2ShipCommitment,
          player1Hits: game.player1Hits,
          player2Hits: game.player2Hits,
          gameEnded: game.gameEnded,
          winner: game.winner,
          timestamp: game.timestamp
        }
        
        const txSubmitInitialState_player1 = await battleshipWaku.connect(player1).submitInitialState(
          channelId,
          game_converted,
          stateSignature_createGame,
          proofPlayer1_converted
        );
        const receiptSubmitInitialState_player1 = await txSubmitInitialState_player1.wait();
        console.log("Submit initial state player 1 receipt", receiptSubmitInitialState_player1);

        const game2 = await gameStateChannel2.getGameState();
        const game_converted2 = {
          nonce: game2.nonce,
          currentTurn: game2.currentTurn,
          moveCount: game2.moveCount,
          player1ShipCommitment: game2.player1ShipCommitment,
          player2ShipCommitment: game2.player2ShipCommitment,
          player1Hits: game2.player1Hits,
          player2Hits: game2.player2Hits,
          gameEnded: game2.gameEnded,
          winner: game2.winner,
          timestamp: game2.timestamp
        }

        const txSubmitInitialState_player2 = await battleshipWaku.connect(player2).submitInitialState(
          channelId,
          game_converted2,
          stateSignature_createGame2,
          proofPlayer2_converted
        );
        const receiptSubmitInitialState_player2 = await txSubmitInitialState_player2.wait();
        console.log("Submit initial state player 2 receipt", receiptSubmitInitialState_player2);
        
        // // Create initial states with real commitments
        // const initialState1 = createGameState({
        // currentTurn: player1.address,
        // player1ShipCommitment: hre.ethers.keccak256(hre.ethers.toUtf8Bytes(player1ShipProof.commitment))
        // });
        // const initialState2 = createGameState({
        // currentTurn: player1.address,
        // player2ShipCommitment: hre.ethers.keccak256(hre.ethers.toUtf8Bytes(player2ShipProof.commitment))
        // });

        // const signature1 = await signGameState(initialState1, player1);
        // const signature2 = await signGameState(initialState2, player2);

        // // Both players submit initial states
        // await expect(battleshipWaku.connect(player1).submitInitialState(1, initialState1, signature1, player1ShipProof))
        // .to.emit(battleshipWaku, "InitialStateSubmitted")
        // .withArgs(1, player1.address, hre.ethers.keccak256(hre.ethers.AbiCoder.defaultAbiCoder().encode(
        //     ["tuple(bytes32,uint256,address,uint256,bytes32,bytes32,uint8,uint8,bool,address,uint256)"],
        //     [[
        //     initialState1.stateHash,
        //     initialState1.nonce,
        //     initialState1.currentTurn,
        //     initialState1.moveCount,
        //     initialState1.player1ShipCommitment,
        //     initialState1.player2ShipCommitment,
        //     initialState1.player1Hits,
        //     initialState1.player2Hits,
        //     initialState1.gameEnded,
        //     initialState1.winner,
        //     initialState1.timestamp
        //     ]]
        // )));

        // await expect(battleshipWaku.connect(player2).submitInitialState(1, initialState2, signature2, player2ShipProof))
        // .to.emit(battleshipWaku, "InitialStateSubmitted")
        // .withArgs(1, player2.address, hre.ethers.keccak256(hre.ethers.AbiCoder.defaultAbiCoder().encode(
        //     ["tuple(bytes32,uint256,address,uint256,bytes32,bytes32,uint8,uint8,bool,address,uint256)"],
        //     [[
        //     initialState2.stateHash,
        //     initialState2.nonce,
        //     initialState2.currentTurn,
        //     initialState2.moveCount,
        //     initialState2.player1ShipCommitment,
        //     initialState2.player2ShipCommitment,
        //     initialState2.player1Hits,
        //     initialState2.player2Hits,
        //     initialState2.gameEnded,
        //     initialState2.winner,
        //     initialState2.timestamp
        //     ]]
        // ))).to.emit(battleshipWaku, "ChannelReady");
    });

    // it("Should reject duplicate initial state submissions", async function () {
    //   const { battleshipWaku, player1, player2, gameStateChannel } = await loadFixture(deployBattleshipFixture);

    //   await battleshipWaku.connect(player1).openChannel(player2.address);
      
    //   const shipProof = await generateShipPlacementProof(gameStateChannel);
    //   const initialState = createGameState({ currentTurn: player1.address });
    //   const signature = await signGameState(initialState, player1);

    //   // First submission should succeed
    //   await battleshipWaku.connect(player1).submitInitialState(1, initialState, signature, shipProof);
      
    //   // Second submission should fail
    //   await expect(battleshipWaku.connect(player1).submitInitialState(1, initialState, signature, shipProof))
    //     .to.be.revertedWith("Already submitted initial state");
    // });

    // it("Should reject submissions from non-players", async function () {
    //   const { battleshipWaku, player1, player2, player3, gameStateChannel } = await loadFixture(deployBattleshipFixture);

    //   await battleshipWaku.connect(player1).openChannel(player2.address);
      
    //   const shipProof = await generateShipPlacementProof(gameStateChannel);
    //   const initialState = createGameState({ currentTurn: player1.address });
    //   const signature = await signGameState(initialState, player3);

    //   await expect(battleshipWaku.connect(player3).submitInitialState(1, initialState, signature, shipProof))
    //     .to.be.revertedWith("Not a player");
    // });
  });

//   describe("Game Simulation with Move Sequences", function () {
//     it("Should simulate a complete game with moves and hits", async function () {
//       const { battleshipWaku, player1, player2, gameStateChannel } = await loadFixture(deployBattleshipFixture);

//       // Setup channel and initial states
//       await battleshipWaku.connect(player1).openChannel(player2.address);
      
//       const player1ShipProof = await generateShipPlacementProof(gameStateChannel);
//       const player2ShipProof = await generateShipPlacementProof(gameStateChannel);

//       const initialState1 = createGameState({
//         currentTurn: player1.address,
//         player1ShipCommitment: hre.ethers.keccak256(hre.ethers.toUtf8Bytes(player1ShipProof.commitment))
//       });
//       const initialState2 = createGameState({
//         currentTurn: player1.address,
//         player2ShipCommitment: hre.ethers.keccak256(hre.ethers.toUtf8Bytes(player2ShipProof.commitment))
//       });

//       const signature1 = await signGameState(initialState1, player1);
//       const signature2 = await signGameState(initialState2, player2);

//       await battleshipWaku.connect(player1).submitInitialState(1, initialState1, signature1, player1ShipProof);
//       await battleshipWaku.connect(player2).submitInitialState(1, initialState2, signature2, player2ShipProof);

//       // Simulate game moves
//       const moves = [
//         { x: 0, y: 0, hit: 1, player: player1 },
//         { x: 1, y: 1, hit: 0, player: player2 },
//         { x: 0, y: 1, hit: 1, player: player1 },
//         { x: 2, y: 2, hit: 0, player: player2 },
//         { x: 0, y: 2, hit: 1, player: player1 }
//       ];

//       // Validate that we can create move proofs for realistic game scenarios
//       for (const move of moves) {
//         const moveProof = createMoveProof(move.x, move.y, move.hit);
//         expect(moveProof.pubSignals[0]).to.equal(BigInt(move.x));
//         expect(moveProof.pubSignals[1]).to.equal(BigInt(move.y));
//         expect(moveProof.pubSignals[2]).to.equal(BigInt(move.hit));
//       }

//       // Test final game state with winner
//       const finalState = createGameState({
//         nonce: 10,
//         moveCount: 5,
//         player1Hits: 3,
//         player2Hits: 0,
//         gameEnded: true,
//         winner: player1.address
//       });

//       const finalSignature1 = await signGameState(finalState, player1);
//       const finalSignature2 = await signGameState(finalState, player2);
//       const winProof = createWinProof(17, parseInt(player1.address, 16));

//       // Settle the channel with final state
//       await expect(battleshipWaku.connect(player1).settleChannel(
//         1, 
//         finalState, 
//         finalSignature1, 
//         finalSignature2, 
//         winProof
//       )).to.emit(battleshipWaku, "ChannelSettled")
//         .withArgs(1, finalState.winner);

//       const channel = await battleshipWaku.getChannel(1);
//       expect(channel[3]).to.equal(2); // ChannelStatus.Settled
//       expect(channel[7]).to.equal(player1.address); // winner
//     });
//   });

//   describe("Dispute Resolution System", function () {
//     it("Should handle dispute initiation and resolution", async function () {
//       const { battleshipWaku, player1, player2, gameStateChannel } = await loadFixture(deployBattleshipFixture);

//       // Setup channel
//       await battleshipWaku.connect(player1).openChannel(player2.address);
      
//       const shipProof1 = await generateShipPlacementProof(gameStateChannel);
//       const shipProof2 = await generateShipPlacementProof(gameStateChannel);

//       const initialState1 = createGameState({ currentTurn: player1.address });
//       const initialState2 = createGameState({ currentTurn: player1.address });

//       const signature1 = await signGameState(initialState1, player1);
//       const signature2 = await signGameState(initialState2, player2);

//       await battleshipWaku.connect(player1).submitInitialState(1, initialState1, signature1, shipProof1);
//       await battleshipWaku.connect(player2).submitInitialState(1, initialState2, signature2, shipProof2);

//       // Create a disputed state
//       const disputedState = createGameState({
//         nonce: 5,
//         moveCount: 3,
//         player1Hits: 2,
//         currentTurn: player2.address
//       });

//       const disputeSignature1 = await signGameState(disputedState, player1);
//       const disputeSignature2 = await signGameState(disputedState, player2);

//       // Initiate dispute
//       await expect(battleshipWaku.connect(player1).initiateDispute(
//         1,
//         0, // DisputeType.InvalidMove
//         disputedState,
//         disputeSignature1,
//         disputeSignature2
//       )).to.emit(battleshipWaku, "DisputeInitiated")
//         .withArgs(1, 1, player1.address, 0);

//       const dispute = await battleshipWaku.getDispute(1);
//       expect(dispute[1]).to.equal(player1.address); // challenger
//       expect(dispute[2]).to.equal(player2.address); // respondent
//       expect(dispute[3]).to.equal(0); // DisputeType.InvalidMove
//       expect(dispute[4]).to.equal(0); // DisputeStatus.Active

//       // Fast forward to after response deadline
//       await time.increase(180); // 3 minutes

//       // Resolve dispute (challenger wins due to no response)
//       await expect(battleshipWaku.connect(player1).resolveDispute(1))
//         .to.emit(battleshipWaku, "DisputeResolved")
//         .withArgs(1, player1.address, hre.ethers.keccak256(hre.ethers.AbiCoder.defaultAbiCoder().encode(
//           ["tuple(bytes32,uint256,address,uint256,bytes32,bytes32,uint8,uint8,bool,address,uint256)"],
//           [[
//             disputedState.stateHash,
//             disputedState.nonce,
//             disputedState.currentTurn,
//             disputedState.moveCount,
//             disputedState.player1ShipCommitment,
//             disputedState.player2ShipCommitment,
//             disputedState.player1Hits,
//             disputedState.player2Hits,
//             disputedState.gameEnded,
//             disputedState.winner,
//             disputedState.timestamp
//           ]]
//         )))
//         .to.emit(battleshipWaku, "ChannelSettled")
//         .withArgs(1, player1.address);
//     });

//     it("Should handle dispute response with counter-state", async function () {
//       const { battleshipWaku, player1, player2, gameStateChannel } = await loadFixture(deployBattleshipFixture);

//       // Setup channel
//       await battleshipWaku.connect(player1).openChannel(player2.address);
      
//       const shipProof1 = await generateShipPlacementProof(gameStateChannel);
//       const shipProof2 = await generateShipPlacementProof(gameStateChannel);

//       const initialState1 = createGameState({ currentTurn: player1.address });
//       const initialState2 = createGameState({ currentTurn: player1.address });

//       const signature1 = await signGameState(initialState1, player1);
//       const signature2 = await signGameState(initialState2, player2);

//       await battleshipWaku.connect(player1).submitInitialState(1, initialState1, signature1, shipProof1);
//       await battleshipWaku.connect(player2).submitInitialState(1, initialState2, signature2, shipProof2);

//       // Create disputed state
//       const disputedState = createGameState({ nonce: 5 });
//       const disputeSignature1 = await signGameState(disputedState, player1);
//       const disputeSignature2 = await signGameState(disputedState, player2);

//       // Initiate dispute
//       await battleshipWaku.connect(player1).initiateDispute(1, 0, disputedState, disputeSignature1, disputeSignature2);

//       // Create counter-state with higher nonce
//       const counterState = createGameState({
//         nonce: 6,
//         moveCount: 4,
//         player1Hits: 3
//       });

//       const counterSignature1 = await signGameState(counterState, player1);
//       const counterSignature2 = await signGameState(counterState, player2);
      
//       const moveProofs = [createMoveProof(3, 3, 1)];

//       // Respond to dispute with counter-state
//       await expect(battleshipWaku.connect(player2).respondToDispute(
//         1,
//         counterState,
//         counterSignature1,
//         counterSignature2,
//         moveProofs
//       )).to.emit(battleshipWaku, "DisputeChallenged")
//         .withArgs(1, player2.address, hre.ethers.keccak256(hre.ethers.AbiCoder.defaultAbiCoder().encode(
//           ["tuple(bytes32,uint256,address,uint256,bytes32,bytes32,uint8,uint8,bool,address,uint256)"],
//           [[
//             counterState.stateHash,
//             counterState.nonce,
//             counterState.currentTurn,
//             counterState.moveCount,
//             counterState.player1ShipCommitment,
//             counterState.player2ShipCommitment,
//             counterState.player1Hits,
//             counterState.player2Hits,
//             counterState.gameEnded,
//             counterState.winner,
//             counterState.timestamp
//           ]]
//         )));

//       const updatedDispute = await battleshipWaku.getDispute(1);
//       expect(updatedDispute[4]).to.equal(1); // DisputeStatus.Challenged
//     });
//   });

//   describe("Timeout Handling", function () {
//     it("Should allow timeout claims after challenge period", async function () {
//       const { battleshipWaku, player1, player2 } = await loadFixture(deployBattleshipFixture);

//       // Open channel
//       await battleshipWaku.connect(player1).openChannel(player2.address);

//       // Fast forward past timeout period (7 * CHALLENGE_PERIOD = 35 minutes)
//       await time.increase(2200); // 36+ minutes

//       // Claim timeout
//       await expect(battleshipWaku.connect(player1).claimTimeout(1))
//         .to.emit(battleshipWaku, "TimeoutClaimed")
//         .withArgs(1, player1.address)
//         .to.emit(battleshipWaku, "ChannelSettled")
//         .withArgs(1, player1.address);

//       const channel = await battleshipWaku.getChannel(1);
//       expect(channel[3]).to.equal(2); // ChannelStatus.Settled
//       expect(channel[7]).to.equal(player1.address); // winner
//     });

//     it("Should reject timeout claims before period expires", async function () {
//       const { battleshipWaku, player1, player2 } = await loadFixture(deployBattleshipFixture);

//       await battleshipWaku.connect(player1).openChannel(player2.address);

//       // Try to claim timeout too early
//       await expect(battleshipWaku.connect(player1).claimTimeout(1))
//         .to.be.revertedWith("Challenge period not over");
//     });
//   });

//   describe("Ship Placement Validation", function () {
//     it("Should validate ship placements using game generator", async function () {
//       const { gameStateChannel } = await loadFixture(deployBattleshipFixture);

//       // Test valid ship placements
//       const validShips = [
//         [0, 0, 3, 0], // Ship of length 3, horizontal
//         [1, 0, 3, 0], // Ship of length 3, horizontal  
//         [2, 0, 2, 0], // Ship of length 2, horizontal
//         [3, 0, 2, 0], // Ship of length 2, horizontal
//         [4, 0, 2, 0]  // Ship of length 2, horizontal
//       ];

//       const validInput = await gameStateChannel.generateCorrectInput(validShips);
//       expect(validInput).to.have.property('ships');
//       expect(validInput).to.have.property('board_state');
//       expect(validInput).to.have.property('commitment');
//       expect(validInput).to.have.property('merkle_root');

//       // Test ship validation
//       const isValid = gameStateChannel.validateInput(validShips, validInput.board_state);
//       expect(isValid).to.be.true;

//       // Test invalid overlapping ships
//       const invalidShips = [
//         [0, 0, 3, 0], // Ship of length 3, horizontal
//         [0, 0, 3, 1], // Overlapping ship
//         [2, 0, 2, 0],
//         [3, 0, 2, 0], 
//         [4, 0, 2, 0]
//       ];

//       const invalidInput = await gameStateChannel.generateCorrectInput(invalidShips);
//       const isInvalid = gameStateChannel.validateInput(invalidShips, invalidInput.board_state);
//       expect(isInvalid).to.be.false;
//     });

//     it("Should generate random ship positions within bounds", async function () {
//       const { gameStateChannel } = await loadFixture(deployBattleshipFixture);

//       for (let i = 0; i < 10; i++) {
//         const randomShips = gameStateChannel.generateRandomShipPositions();
//         expect(randomShips).to.have.length(5); // 5 ships

//         // Validate each ship is within bounds
//         randomShips.forEach((ship, index) => {
//           const [x, y, length, orientation] = ship;
//           expect(x).to.be.at.least(0).and.at.most(9);
//           expect(y).to.be.at.least(0).and.at.most(9);
//           expect(length).to.equal(gameStateChannel.shipSizes[index]);
//           expect(orientation).to.be.oneOf([0, 1]);

//           // Check ship doesn't extend beyond board
//           const endX = x + (1 - orientation) * (length - 1);
//           const endY = y + orientation * (length - 1);
//           expect(endX).to.be.at.most(9);
//           expect(endY).to.be.at.most(9);
//         });
//       }
//     });
//   });

//   describe("Error Handling and Edge Cases", function () {
//     it("Should handle invalid signatures gracefully", async function () {
//       const { battleshipWaku, player1, player2, gameStateChannel } = await loadFixture(deployBattleshipFixture);

//       await battleshipWaku.connect(player1).openChannel(player2.address);
      
//       const shipProof = await generateShipPlacementProof(gameStateChannel);
//       const initialState = createGameState({ currentTurn: player1.address });
      
//       // Create signature with wrong signer
//       const wrongSignature = await signGameState(initialState, player2);

//       await expect(battleshipWaku.connect(player1).submitInitialState(1, initialState, wrongSignature, shipProof))
//         .to.be.revertedWith("Invalid signature");
//     });

//     it("Should prevent operations on closed channels", async function () {
//       const { battleshipWaku, player1, player2, gameStateChannel } = await loadFixture(deployBattleshipFixture);

//       await battleshipWaku.connect(player1).openChannel(player2.address);
      
//       // Close channel via timeout
//       await time.increase(2200);
//       await battleshipWaku.connect(player1).claimTimeout(1);

//       const shipProof = await generateShipPlacementProof(gameStateChannel);
//       const initialState = createGameState({ currentTurn: player1.address });
//       const signature = await signGameState(initialState, player1);

//       await expect(battleshipWaku.connect(player1).submitInitialState(1, initialState, signature, shipProof))
//         .to.be.revertedWith("Channel not open");
//     });

//   });
});