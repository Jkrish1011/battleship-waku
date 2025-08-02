const { expect } = require("chai");
const hre = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const { GameStateChannel } = require("./helpers/GameStateChannel");
const fs = require("fs");
const path = require("path");

describe("BattleshipStateChannelGame - Advanced End-to-End Tests", function () {
  // Increase timeout for zk proof generation
  this.timeout(120000);

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
    
    const gameStateChannel = new GameStateChannel("387", player1, 31337, battleshipWaku.target, "initiator");
    await gameStateChannel.initialize();

    const gameStateChannel2 = new GameStateChannel("387", player2, 31337, battleshipWaku.target, "challenger");
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

  describe("Game Play", function () {

    it("Should reject duplicate initial state submissions", async function () {
      const { battleshipWaku, player1, player2, gameStateChannel, shipPlacementVerifier, gameStateChannel2, moveVerifier, winVerifier } = await loadFixture(deployBattleshipFixture);

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

      const verification = JSON.parse(fs.readFileSync(verificationKeyPath));
      console.log("--");

      const {proof: proofPlayer1, calldata: calldataPlayer1} = await gameStateChannel.generateProof(shipPlacementPositionsPlayer1, wasmPath, zkeyPath);
      // console.log(proofPlayer1);
      const proofPlayer1_converted = {
          pA: calldataPlayer1[0],
          pB: calldataPlayer1[1],
          pC: calldataPlayer1[2],
          pubSignals: calldataPlayer1[3]
      };
      
      let offchainVerification = await gameStateChannel.verifyProof(verification, proofPlayer1);
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

      const submitInitialStateEvent_player1 = receiptSubmitInitialState_player1.logs.find((log: any) => {
        try {
            const parsed = battleshipWaku.interface.parseLog(log);
            return parsed?.name === 'InitialStateSubmitted';
        } catch {
            return false;
        }
      });
      
      const stateHash_player1 = submitInitialStateEvent_player1 ? 
          battleshipWaku.interface.parseLog(submitInitialStateEvent_player1).args.stateHash : 
          null;

      console.log("State hash submit initial state player 1", stateHash_player1);

      const gameState_Player1 = await battleshipWaku.getGameState(stateHash_player1);
      console.log("Game state:: Player 1", gameState_Player1);
      
      await expect(battleshipWaku.connect(player1).submitInitialState(
        channelId,
        game_converted,
        stateSignature_createGame,
        proofPlayer1_converted
      )).to.be.revertedWith("Already submitted initial state");
      
      console.log("--");
  });

    it("Should reject submissions from non-players", async function () {
      const { battleshipWaku, player1, player2, player3, gameStateChannel, shipPlacementVerifier, gameStateChannel2, } = await loadFixture(deployBattleshipFixture);

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

      const verification = JSON.parse(fs.readFileSync(verificationKeyPath));
      console.log("--");

      const {proof: proofPlayer1, calldata: calldataPlayer1} = await gameStateChannel.generateProof(shipPlacementPositionsPlayer1, wasmPath, zkeyPath);
      // console.log(proofPlayer1);
      const proofPlayer1_converted = {
          pA: calldataPlayer1[0],
          pB: calldataPlayer1[1],
          pC: calldataPlayer1[2],
          pubSignals: calldataPlayer1[3]
      };
      
      let offchainVerification = await gameStateChannel.verifyProof(verification, proofPlayer1);
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

      const submitInitialStateEvent_player1 = receiptSubmitInitialState_player1.logs.find((log: any) => {
        try {
            const parsed = battleshipWaku.interface.parseLog(log);
            return parsed?.name === 'InitialStateSubmitted';
        } catch {
            return false;
        }
      });
      
      const stateHash_player1 = submitInitialStateEvent_player1 ? 
          battleshipWaku.interface.parseLog(submitInitialStateEvent_player1).args.stateHash : 
          null;

      console.log("State hash submit initial state player 1", stateHash_player1);

      await expect(battleshipWaku.connect(player3).submitInitialState(channelId, game_converted, stateSignature_createGame, proofPlayer1_converted))
        .to.be.revertedWith("Not a player");
    });

    it("Should allow both players to submit valid initial states and perform a gull game simulation without disputes", async function () {
        const { battleshipWaku, player1, player2, gameStateChannel, shipPlacementVerifier, gameStateChannel2, moveVerifier, winVerifier } = await loadFixture(deployBattleshipFixture);

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

        const verification = JSON.parse(fs.readFileSync(verificationKeyPath));
        console.log("--");

        const {proof: proofPlayer1, calldata: calldataPlayer1} = await gameStateChannel.generateProof(shipPlacementPositionsPlayer1, wasmPath, zkeyPath);
        // console.log(proofPlayer1);
        const proofPlayer1_converted = {
            pA: calldataPlayer1[0],
            pB: calldataPlayer1[1],
            pC: calldataPlayer1[2],
            pubSignals: calldataPlayer1[3]
        };
        
        let offchainVerification = await gameStateChannel.verifyProof(verification, proofPlayer1);
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
        };
        
        const txSubmitInitialState_player1 = await battleshipWaku.connect(player1).submitInitialState(
          channelId,
          game_converted,
          stateSignature_createGame,
          proofPlayer1_converted
        );
        const receiptSubmitInitialState_player1 = await txSubmitInitialState_player1.wait();
        console.log("Submit initial state player 1 receipt", receiptSubmitInitialState_player1);

        const submitInitialStateEvent_player1 = receiptSubmitInitialState_player1.logs.find((log: any) => {
          try {
              const parsed = battleshipWaku.interface.parseLog(log);
              return parsed?.name === 'InitialStateSubmitted';
          } catch {
              return false;
          }
        });
        
        const stateHash_player1 = submitInitialStateEvent_player1 ? 
            battleshipWaku.interface.parseLog(submitInitialStateEvent_player1).args.stateHash : 
            null;

        console.log("State hash submit initial state player 1", stateHash_player1);

        const gameState_Player1 = await battleshipWaku.getGameState(stateHash_player1);
        console.log("Game state:: Player 1", gameState_Player1);
        
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
        // console.log("Submit initial state player 2 receipt", receiptSubmitInitialState_player2);

        const submitInitialStateEvent_player2 = receiptSubmitInitialState_player2.logs.find((log: any) => {
          try {
              const parsed = battleshipWaku.interface.parseLog(log);
              return parsed?.name === 'InitialStateSubmitted';
          } catch {
              return false;
          }
        });
        
        const stateHash_player2 = submitInitialStateEvent_player2 ? 
            battleshipWaku.interface.parseLog(submitInitialStateEvent_player2).args.stateHash : 
            null;

        console.log("StateHash submit initial state player 2", stateHash_player2);
        
        const gameState_Player2 = await battleshipWaku.getGameState(stateHash_player2);
        console.log("Game state:: Player 2", gameState_Player2);

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

        
        console.log("--");

        const moveWasmPath = path.join(__dirname, "..", "build", "move_verification", "move_verification_js", "move_verification.wasm");
        const moveZkeyPath = path.join(__dirname, "..", "keys", "move_verification_final.zkey");
        const moveVerificationKeyPath = path.join(__dirname, "..", "keys", "move_verification_key.json");
        if (!fs.existsSync(moveWasmPath)) {
          throw new Error(`WASM file not found at: ${moveWasmPath}`);
        }
        
        if (!fs.existsSync(moveZkeyPath)) {
            throw new Error(`zkey file not found at: ${moveZkeyPath}`);
        }
        if (!fs.existsSync(moveVerificationKeyPath)) {
            throw new Error(`verification file not found at: ${moveVerificationKeyPath}`);
        }
        console.log("moveWasmPath", moveWasmPath);
        console.log("zkemoveZkeyPathyPath", moveZkeyPath);

        const moveVerification = JSON.parse(fs.readFileSync(moveVerificationKeyPath));
    
        const player1ShipPositions = gameStateChannel.calculateShipPositions(shipPositions1);
        const player2ShipPositions = gameStateChannel.calculateShipPositions(shipPositions2);
        let winnerDeclared = false;
        let winner = "";
        for (let i = 0; i < 12; i++) {
          // Player 1 makes a move. This computation is done at the player2's end in the actual game.
          console.log("Player 1 makes a move", i);
          const guessPlayer1 = player2ShipPositions[i];
          // All these computations are done by player 2.
          const hit = 1;
          
          const moveInputPlayer1 = {
            salt: shipPlacementPositionsPlayer2.salt,
            commitment: shipPlacementPositionsPlayer2.commitment,
            merkle_root: shipPlacementPositionsPlayer2.merkle_root,
            board_state: shipPlacementPositionsPlayer2.board_state,
            guess_x: guessPlayer1[0],
            guess_y: guessPlayer1[1],
            hit: hit
          };
          // Player 2 generates the proof for the move made by Player 1
          const {proof: _proofMovePlayer1, calldata: proofMovePlayer1} = await gameStateChannel2.generateProof(moveInputPlayer1, moveWasmPath, moveZkeyPath);
          // console.log(proofPlayer1);
          const proofMovePlayer1_converted = {
            pA: proofMovePlayer1[0],
            pB: proofMovePlayer1[1],
            pC: proofMovePlayer1[2],
            pubSignals: proofMovePlayer1[3]
          };
          // PLayer 2 verify locally if proofs are right and shares it with the Player1
          await gameStateChannel2.verifyProof(moveVerification, _proofMovePlayer1);

          // Player 1 verifies the proof generated by Player 2
          let resultMovePlayer1 = await moveVerifier.verifyProof(proofMovePlayer1_converted.pA, proofMovePlayer1_converted.pB, proofMovePlayer1_converted.pC, proofMovePlayer1_converted.pubSignals);
          console.log("Move verification proof player 1 at Player 2's side", resultMovePlayer1);

          let offchainVerification = await gameStateChannel.verifyProof(moveVerification, _proofMovePlayer1);
          console.log("Offchain move verification proof player 1 at Player 2's side", offchainVerification);

          // This is computed back at Player1's end.
          let move_player1 = {
            x: guessPlayer1[0],
            y: guessPlayer1[1],
            isHit: hit,
            timestamp: Date.now()
          };

          // PLayer 1 checks gets to know if it's a hit or a miss and updates the state accordingly!
          const isMyTurn_player1 = await gameStateChannel.isMyTurn();
          console.log("isMyTurn_player1", isMyTurn_player1);
          let moveStateHash_player1 = "";
          if(isMyTurn_player1) {
            let {signature: moveStatehash, winnerFound: winnerFound1, winner: winner1} = await gameStateChannel.makeMove(move_player1);
            console.log("Player1 current move state hash ", moveStatehash);
            moveStateHash_player1 = moveStatehash;
            if(winnerFound1) {
                console.log("Game Over");
                winnerDeclared = true;
                winner = winner1;
            }
          }

          // If the move is valid, Player 2 acknowledges the move and shares the result back to Player 1
          if(resultMovePlayer1 && offchainVerification) {
            gameStateChannel2.acknowledgeMove(hit);
            gameStateChannel.switchTurn();
            gameStateChannel2.switchTurn();
          }

          //updates the moves on both player 1 and player 2 side
          const movesData_player1 = {
            move: move_player1,
            moveStatehash: moveStateHash_player1,
            gameState: gameStateChannel.getGameState(),
            gameStateHash: moveStateHash_player1
          }

          const movesData_player2 = {
            move: move_player1,
            moveStatehash: moveStateHash_player1,
            gameState: gameStateChannel2.getGameState(),
            gameStateHash: moveStateHash_player1
          };

          await gameStateChannel.updateMoves(movesData_player1);
          await gameStateChannel2.updateMoves(movesData_player2);

          if(winnerDeclared) {
            gameStateChannel.declareWinner(winner);
            gameStateChannel2.declareWinner(winner);
            break;
          }
          
          // Player 2 makes a move. This computation is done at the player1's end in the actual game.
          console.log("Player 2 makes a move", i);
          const guessPlayer2 = player1ShipPositions[i];
          const hit2 = 1;
        
          const moveInputPlayer2 = {
            salt: shipPlacementPositionsPlayer1.salt,
            commitment: shipPlacementPositionsPlayer1.commitment,
            merkle_root: shipPlacementPositionsPlayer1.merkle_root,
            board_state: shipPlacementPositionsPlayer1.board_state,
            guess_x: guessPlayer2[0],
            guess_y: guessPlayer2[1],
            hit: hit2
          };
          // Player 1 generates the proof for the move made by Player 2
          const {proof: _proofMovePlayer2, calldata: proofMovePlayer2} = await gameStateChannel.generateProof(moveInputPlayer2, moveWasmPath, moveZkeyPath);
          // console.log(proofPlayer1);
          const proofMovePlayer2_converted = {
            pA: proofMovePlayer2[0],
            pB: proofMovePlayer2[1],
            pC: proofMovePlayer2[2],
            pubSignals: proofMovePlayer2[3]
          };
        
          let resultMovePlayer2 = await moveVerifier.verifyProof(proofMovePlayer2_converted.pA, proofMovePlayer2_converted.pB, proofMovePlayer2_converted.pC, proofMovePlayer2_converted.pubSignals);
          console.log("Move verification proof player 2 at Player 1's side", resultMovePlayer2);
          let offchainVerification2 = await gameStateChannel.verifyProof(moveVerification, _proofMovePlayer2);
          console.log("Offchain move verification proof player 2 at Player 1's side", offchainVerification2);

          // Player 2 verifies the proof generated by Player 1
          gameStateChannel2.verifyProof(moveVerification, _proofMovePlayer2);

           // This is computed back at Player2's end.
           let move_player2 = {
            x: guessPlayer2[0],
            y: guessPlayer2[1],
            isHit: hit2,
            timestamp: Date.now()
          };

          // PLayer 2 checks gets to know if it's a hit or a miss and updates the state accordingly!
          if(await gameStateChannel2.isMyTurn()) {
            let {signature: moveStatehash2, winnerFound: winnerFound2, winner: winner2} = await gameStateChannel2.makeMove(move_player2);
            console.log("Player2 current move state hash ", moveStatehash2);
            if(winnerFound2) {
                console.log("Game Over");
                winnerDeclared = true;
                winner = winner2;
            }
          }

          // If the move is valid, Player 1 acknowledges the move and shares the result back to Player 2
          if(resultMovePlayer2 && offchainVerification2) {

            gameStateChannel.acknowledgeMove(hit2);
            gameStateChannel.switchTurn();
            gameStateChannel2.switchTurn();
          }

          //updates the moves on both player 1 and player 2 side
          const movesData2_player1 = {
            move: move_player1,
            moveStatehash: moveStateHash_player1,
            gameState: gameStateChannel.getGameState(),
            gameStateHash: moveStateHash_player1
          }

          const movesData2_player2 = {
            move: move_player1,
            moveStatehash: moveStateHash_player1,
            gameState: gameStateChannel2.getGameState(),
            gameStateHash: moveStateHash_player1
          };

          await gameStateChannel.updateMoves(movesData2_player1);
          await gameStateChannel2.updateMoves(movesData2_player2);

          if(winnerDeclared) {
            gameStateChannel.declareWinner(winner);
            gameStateChannel2.declareWinner(winner);
            break;
          }
        }
        const winWasmPath = path.join(__dirname, "..", "build", "win_verification", "win_verification_js", "win_verification.wasm");
        const winZkeyPath = path.join(__dirname, "..", "keys", "win_verification_final.zkey");
        const winVerificationKeyPath = path.join(__dirname, "..", "keys", "win_verification_key.json");
        const winVerification = JSON.parse(fs.readFileSync(winVerificationKeyPath));
        if (!fs.existsSync(winWasmPath)) {
          throw new Error(`WASM file not found at: ${winWasmPath}`);
        }
        
        if (!fs.existsSync(winZkeyPath)) {
            throw new Error(`zkey file not found at: ${winZkeyPath}`);
        }

        if(!winVerification) {
          throw new Error(`Verification key not found at: ${winVerificationKeyPath}`);
        }
        console.log("winWasmPath", winWasmPath);
        console.log("winZkeyPath", winZkeyPath);
        console.log("winVerificationKeyPath", winVerificationKeyPath);
    
        // Win verification for Player 1
        const winInputPlayer1 = {
          salt: shipPlacementPositionsPlayer2.salt,
          commitment: shipPlacementPositionsPlayer2.commitment,
          merkle_root: shipPlacementPositionsPlayer2.merkle_root,
          board_state: shipPlacementPositionsPlayer2.board_state,
          hit_count: 12,
          hits: player2ShipPositions,
        }
    
        const {proof: _proofWinPlayer1, calldata: proofWinPlayer1} = await gameStateChannel.generateProof(winInputPlayer1, winWasmPath, winZkeyPath);
        const proofWinPlayer1_converted = {
          pA: proofWinPlayer1[0],
          pB: proofWinPlayer1[1],
          pC: proofWinPlayer1[2],
          pubSignals: proofWinPlayer1[3]
        }
    
        let resultWinPlayer1 = await winVerifier.verifyProof(proofWinPlayer1_converted.pA, proofWinPlayer1_converted.pB, proofWinPlayer1_converted.pC, proofWinPlayer1_converted.pubSignals);
        console.log("resultWinPlayer1", resultWinPlayer1);
        
        let offchainVerificationWinPlayer1 = await gameStateChannel.verifyProof(winVerification, _proofWinPlayer1);
        console.log("offchainVerificationWinPlayer1", offchainVerificationWinPlayer1);

        console.log("Player 1 game state ", gameStateChannel.getGameState());
        console.log("Player 2 game state ", gameStateChannel2.getGameState());
        
    });

  });

  describe("Dispute Resolution System", function () {
    it("Should handle dispute initiation and resolution", async function () {
      
      /*
        Open the state channels for both the players and submit initial state. Do few moves for name sake. 
        Dispute a move and nonce and initiate the dispute from player 2's side.

        let the time pass so that player 2 winner the game.

        Resolve the dispute using timepassed route. See if player 2 is declared as winner.

      */

        const { battleshipWaku, player1, player2, gameStateChannel, shipPlacementVerifier, gameStateChannel2, moveVerifier, winVerifier } = await loadFixture(deployBattleshipFixture);

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

        const verification = JSON.parse(fs.readFileSync(verificationKeyPath));
        console.log("--");

        const {proof: proofPlayer1, calldata: calldataPlayer1} = await gameStateChannel.generateProof(shipPlacementPositionsPlayer1, wasmPath, zkeyPath);
        // console.log(proofPlayer1);
        const proofPlayer1_converted = {
            pA: calldataPlayer1[0],
            pB: calldataPlayer1[1],
            pC: calldataPlayer1[2],
            pubSignals: calldataPlayer1[3]
        };
        
        let offchainVerification = await gameStateChannel.verifyProof(verification, proofPlayer1);
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

        const submitInitialStateEvent_player1 = receiptSubmitInitialState_player1.logs.find((log: any) => {
          try {
              const parsed = battleshipWaku.interface.parseLog(log);
              return parsed?.name === 'InitialStateSubmitted';
          } catch {
              return false;
          }
        });
        
        const stateHash_player1 = submitInitialStateEvent_player1 ? 
            battleshipWaku.interface.parseLog(submitInitialStateEvent_player1).args.stateHash : 
            null;

        console.log("State hash submit initial state player 1", stateHash_player1);

        const gameState_Player1 = await battleshipWaku.getGameState(stateHash_player1);
        console.log("Game state:: Player 1", gameState_Player1);
        
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
        // console.log("Submit initial state player 2 receipt", receiptSubmitInitialState_player2);

        const submitInitialStateEvent_player2 = receiptSubmitInitialState_player2.logs.find((log: any) => {
          try {
              const parsed = battleshipWaku.interface.parseLog(log);
              return parsed?.name === 'InitialStateSubmitted';
          } catch {
              return false;
          }
        });
        
        const stateHash_player2 = submitInitialStateEvent_player2 ? 
            battleshipWaku.interface.parseLog(submitInitialStateEvent_player2).args.stateHash : 
            null;

        console.log("StateHash submit initial state player 2", stateHash_player2);
        
        const gameState_Player2 = await battleshipWaku.getGameState(stateHash_player2);
        console.log("Game state:: Player 2", gameState_Player2);

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

        
        console.log("--");

        const moveWasmPath = path.join(__dirname, "..", "build", "move_verification", "move_verification_js", "move_verification.wasm");
        const moveZkeyPath = path.join(__dirname, "..", "keys", "move_verification_final.zkey");
        const moveVerificationKeyPath = path.join(__dirname, "..", "keys", "move_verification_key.json");
        if (!fs.existsSync(moveWasmPath)) {
          throw new Error(`WASM file not found at: ${moveWasmPath}`);
        }
        
        if (!fs.existsSync(moveZkeyPath)) {
            throw new Error(`zkey file not found at: ${moveZkeyPath}`);
        }
        if (!fs.existsSync(moveVerificationKeyPath)) {
            throw new Error(`verification file not found at: ${moveVerificationKeyPath}`);
        }
        console.log("moveWasmPath", moveWasmPath);
        console.log("zkemoveZkeyPathyPath", moveZkeyPath);

        const moveVerification = JSON.parse(fs.readFileSync(moveVerificationKeyPath));
    
        const player1ShipPositions = gameStateChannel.calculateShipPositions(shipPositions1);
        const player2ShipPositions = gameStateChannel.calculateShipPositions(shipPositions2);
        let winnerDeclared = false;
        let winner = "";
        for (let i = 0; i < 12; i++) {
          // Player 1 makes a move. This computation is done at the player2's end in the actual game.
          console.log("Player 1 makes a move", i);
          const guessPlayer1 = player2ShipPositions[i];
          // All these computations are done by player 2.
          const hit = 1;
          
          const moveInputPlayer1 = {
            salt: shipPlacementPositionsPlayer2.salt,
            commitment: shipPlacementPositionsPlayer2.commitment,
            merkle_root: shipPlacementPositionsPlayer2.merkle_root,
            board_state: shipPlacementPositionsPlayer2.board_state,
            guess_x: guessPlayer1[0],
            guess_y: guessPlayer1[1],
            hit: hit
          };
          // Player 2 generates the proof for the move made by Player 1
          const {proof: _proofMovePlayer1, calldata: proofMovePlayer1} = await gameStateChannel2.generateProof(moveInputPlayer1, moveWasmPath, moveZkeyPath);
          // console.log(proofPlayer1);
          const proofMovePlayer1_converted = {
            pA: proofMovePlayer1[0],
            pB: proofMovePlayer1[1],
            pC: proofMovePlayer1[2],
            pubSignals: proofMovePlayer1[3]
          };
          // PLayer 2 verify locally if proofs are right and shares it with the Player1
          await gameStateChannel2.verifyProof(moveVerification, _proofMovePlayer1);

          // Player 1 verifies the proof generated by Player 2
          let resultMovePlayer1 = await moveVerifier.verifyProof(proofMovePlayer1_converted.pA, proofMovePlayer1_converted.pB, proofMovePlayer1_converted.pC, proofMovePlayer1_converted.pubSignals);
          console.log("Move verification proof player 1 at Player 2's side", resultMovePlayer1);

          let offchainVerification = await gameStateChannel.verifyProof(moveVerification, _proofMovePlayer1);
          console.log("Offchain move verification proof player 1 at Player 2's side", offchainVerification);

          // This is computed back at Player1's end.
          let move_player1 = {
            x: guessPlayer1[0],
            y: guessPlayer1[1],
            isHit: hit,
            timestamp: Date.now()
          };

          // PLayer 1 checks gets to know if it's a hit or a miss and updates the state accordingly!
          const isMyTurn_player1 = await gameStateChannel.isMyTurn();
          console.log("isMyTurn_player1", isMyTurn_player1);
          
          if(isMyTurn_player1) {
            let {signature: moveStatehash, winnerFound: winnerFound1, winner: winner1} = await gameStateChannel.makeMove(move_player1);
            console.log("Player1 current move state hash ", moveStatehash);
            if(winnerFound1) {
                console.log("Game Over");
                winnerDeclared = true;
                winner = winner1;
            }
          }

          // If the move is valid, Player 2 acknowledges the move and shares the result back to Player 1
          if(resultMovePlayer1 && offchainVerification) {
            gameStateChannel2.acknowledgeMove(hit);
            gameStateChannel.switchTurn();
            gameStateChannel2.switchTurn();
          }

          if(winnerDeclared) {
            gameStateChannel.declareWinner(winner);
            gameStateChannel2.declareWinner(winner);
            break;
          }
          
          // Player 2 makes a move. This computation is done at the player1's end in the actual game.
          console.log("Player 2 makes a move", i);
          const guessPlayer2 = player1ShipPositions[i];
          const hit2 = 1;
        
          const moveInputPlayer2 = {
            salt: shipPlacementPositionsPlayer1.salt,
            commitment: shipPlacementPositionsPlayer1.commitment,
            merkle_root: shipPlacementPositionsPlayer1.merkle_root,
            board_state: shipPlacementPositionsPlayer1.board_state,
            guess_x: guessPlayer2[0],
            guess_y: guessPlayer2[1],
            hit: hit2
          };
          // Player 1 generates the proof for the move made by Player 2
          const {proof: _proofMovePlayer2, calldata: proofMovePlayer2} = await gameStateChannel.generateProof(moveInputPlayer2, moveWasmPath, moveZkeyPath);
          // console.log(proofPlayer1);
          const proofMovePlayer2_converted = {
            pA: proofMovePlayer2[0],
            pB: proofMovePlayer2[1],
            pC: proofMovePlayer2[2],
            pubSignals: proofMovePlayer2[3]
          };
        
          let resultMovePlayer2 = await moveVerifier.verifyProof(proofMovePlayer2_converted.pA, proofMovePlayer2_converted.pB, proofMovePlayer2_converted.pC, proofMovePlayer2_converted.pubSignals);
          console.log("Move verification proof player 2 at Player 1's side", resultMovePlayer2);
          let offchainVerification2 = await gameStateChannel.verifyProof(moveVerification, _proofMovePlayer2);
          console.log("Offchain move verification proof player 2 at Player 1's side", offchainVerification2);

          // Player 2 verifies the proof generated by Player 1
          gameStateChannel2.verifyProof(moveVerification, _proofMovePlayer2);

           // This is computed back at Player2's end.
           let move_player2 = {
            x: guessPlayer2[0],
            y: guessPlayer2[1],
            isHit: hit2,
            timestamp: Date.now()
          };

          // PLayer 2 checks gets to know if it's a hit or a miss and updates the state accordingly!
          if(await gameStateChannel2.isMyTurn()) {
            let {signature: moveStatehash2, winnerFound: winnerFound2, winner: winner2} = await gameStateChannel2.makeMove(move_player2);
            console.log("Player2 current move state hash ", moveStatehash2);
            if(winnerFound2) {
                console.log("Game Over");
                winnerDeclared = true;
                winner = winner2;
            }
          }

          // If the move is valid, Player 1 acknowledges the move and shares the result back to Player 2
          if(resultMovePlayer2 && offchainVerification2) {

            gameStateChannel.acknowledgeMove(hit2);
            gameStateChannel.switchTurn();
            gameStateChannel2.switchTurn();
          }

          if(winnerDeclared) {
            gameStateChannel.declareWinner(winner);
            gameStateChannel2.declareWinner(winner);
            break;
          }
          // After 5 moves, just break to start a dispute.
          if (i == 5) {
            break;
          }
        }
  
      const disputedState = await gameStateChannel.getGameState();
      // Initiate dispute
      await expect(battleshipWaku.connect(player1).initiateDispute(
        1,
        0, // DisputeType.InvalidMove
        disputedState,
        disputeSignature1,
        disputeSignature2
      )).to.emit(battleshipWaku, "DisputeInitiated")
        .withArgs(1, 1, player1.address, 0);

      const dispute = await battleshipWaku.getDispute(1);
      expect(dispute[1]).to.equal(player1.address); // challenger
      expect(dispute[2]).to.equal(player2.address); // respondent
      expect(dispute[3]).to.equal(0); // DisputeType.InvalidMove
      expect(dispute[4]).to.equal(0); // DisputeStatus.Active

      // Fast forward to after response deadline
      await time.increase(180); // 3 minutes

      // Resolve dispute (challenger wins due to no response)
      await expect(battleshipWaku.connect(player1).resolveDispute(1))
        .to.emit(battleshipWaku, "DisputeResolved")
        .withArgs(1, player1.address, hre.ethers.keccak256(hre.ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(bytes32,uint256,address,uint256,bytes32,bytes32,uint8,uint8,bool,address,uint256)"],
          [[
            disputedState.stateHash,
            disputedState.nonce,
            disputedState.currentTurn,
            disputedState.moveCount,
            disputedState.player1ShipCommitment,
            disputedState.player2ShipCommitment,
            disputedState.player1Hits,
            disputedState.player2Hits,
            disputedState.gameEnded,
            disputedState.winner,
            disputedState.timestamp
          ]]
        )))
        .to.emit(battleshipWaku, "ChannelSettled")
        .withArgs(1, player1.address);
    });

    // it("Should handle dispute response with counter-state", async function () {
    //   const { battleshipWaku, player1, player2, gameStateChannel } = await loadFixture(deployBattleshipFixture);

    //   // Setup channel
    //   await battleshipWaku.connect(player1).openChannel(player2.address);
      
    //   const shipProof1 = await generateShipPlacementProof(gameStateChannel);
    //   const shipProof2 = await generateShipPlacementProof(gameStateChannel);

    //   const initialState1 = createGameState({ currentTurn: player1.address });
    //   const initialState2 = createGameState({ currentTurn: player1.address });

    //   const signature1 = await signGameState(initialState1, player1);
    //   const signature2 = await signGameState(initialState2, player2);

    //   await battleshipWaku.connect(player1).submitInitialState(1, initialState1, signature1, shipProof1);
    //   await battleshipWaku.connect(player2).submitInitialState(1, initialState2, signature2, shipProof2);

    //   // Create disputed state
    //   const disputedState = createGameState({ nonce: 5 });
    //   const disputeSignature1 = await signGameState(disputedState, player1);
    //   const disputeSignature2 = await signGameState(disputedState, player2);

    //   // Initiate dispute
    //   await battleshipWaku.connect(player1).initiateDispute(1, 0, disputedState, disputeSignature1, disputeSignature2);

    //   // Create counter-state with higher nonce
    //   const counterState = createGameState({
    //     nonce: 6,
    //     moveCount: 4,
    //     player1Hits: 3
    //   });

    //   const counterSignature1 = await signGameState(counterState, player1);
    //   const counterSignature2 = await signGameState(counterState, player2);
      
    //   const moveProofs = [createMoveProof(3, 3, 1)];

    //   // Respond to dispute with counter-state
    //   await expect(battleshipWaku.connect(player2).respondToDispute(
    //     1,
    //     counterState,
    //     counterSignature1,
    //     counterSignature2,
    //     moveProofs
    //   )).to.emit(battleshipWaku, "DisputeChallenged")
    //     .withArgs(1, player2.address, hre.ethers.keccak256(hre.ethers.AbiCoder.defaultAbiCoder().encode(
    //       ["tuple(bytes32,uint256,address,uint256,bytes32,bytes32,uint8,uint8,bool,address,uint256)"],
    //       [[
    //         counterState.stateHash,
    //         counterState.nonce,
    //         counterState.currentTurn,
    //         counterState.moveCount,
    //         counterState.player1ShipCommitment,
    //         counterState.player2ShipCommitment,
    //         counterState.player1Hits,
    //         counterState.player2Hits,
    //         counterState.gameEnded,
    //         counterState.winner,
    //         counterState.timestamp
    //       ]]
    //     )));

    //   const updatedDispute = await battleshipWaku.getDispute(1);
    //   expect(updatedDispute[4]).to.equal(1); // DisputeStatus.Challenged
    // });
  });

  // describe("Timeout Handling", function () {
  //   it("Should allow timeout claims after challenge period", async function () {
  //     const { battleshipWaku, player1, player2 } = await loadFixture(deployBattleshipFixture);

  //     // Open channel
  //     await battleshipWaku.connect(player1).openChannel(player2.address);

  //     // Fast forward past timeout period (7 * CHALLENGE_PERIOD = 35 minutes)
  //     await time.increase(2200); // 36+ minutes

  //     // Claim timeout
  //     await expect(battleshipWaku.connect(player1).claimTimeout(1))
  //       .to.emit(battleshipWaku, "TimeoutClaimed")
  //       .withArgs(1, player1.address)
  //       .to.emit(battleshipWaku, "ChannelSettled")
  //       .withArgs(1, player1.address);

  //     const channel = await battleshipWaku.getChannel(1);
  //     expect(channel[3]).to.equal(2); // ChannelStatus.Settled
  //     expect(channel[7]).to.equal(player1.address); // winner
  //   });

  //   it("Should reject timeout claims before period expires", async function () {
  //     const { battleshipWaku, player1, player2 } = await loadFixture(deployBattleshipFixture);

  //     await battleshipWaku.connect(player1).openChannel(player2.address);

  //     // Try to claim timeout too early
  //     await expect(battleshipWaku.connect(player1).claimTimeout(1))
  //       .to.be.revertedWith("Challenge period not over");
  //   });
  // });

  // describe("Error Handling and Edge Cases", function () {
  //   it("Should handle invalid signatures gracefully", async function () {
  //     const { battleshipWaku, player1, player2, gameStateChannel } = await loadFixture(deployBattleshipFixture);

  //     await battleshipWaku.connect(player1).openChannel(player2.address);
      
  //     const shipProof = await generateShipPlacementProof(gameStateChannel);
  //     const initialState = createGameState({ currentTurn: player1.address });
      
  //     // Create signature with wrong signer
  //     const wrongSignature = await signGameState(initialState, player2);

  //     await expect(battleshipWaku.connect(player1).submitInitialState(1, initialState, wrongSignature, shipProof))
  //       .to.be.revertedWith("Invalid signature");
  //   });

  //   it("Should prevent operations on closed channels", async function () {
  //     const { battleshipWaku, player1, player2, gameStateChannel } = await loadFixture(deployBattleshipFixture);

  //     await battleshipWaku.connect(player1).openChannel(player2.address);
      
  //     // Close channel via timeout
  //     await time.increase(2200);
  //     await battleshipWaku.connect(player1).claimTimeout(1);

  //     const shipProof = await generateShipPlacementProof(gameStateChannel);
  //     const initialState = createGameState({ currentTurn: player1.address });
  //     const signature = await signGameState(initialState, player1);

  //     await expect(battleshipWaku.connect(player1).submitInitialState(1, initialState, signature, shipProof))
  //       .to.be.revertedWith("Channel not open");
  //   });

  // });
});