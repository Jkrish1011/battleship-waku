import { ethers } from "ethers";

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
      
      const {signature: stateSignature_createGame_ofPlayer1, hash: stateHash_createGame_ofPlayer1} = await gameStateChannel.createGame(
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

      if (stateSignature_createGame_ofPlayer1 === "" || stateHash_createGame_ofPlayer1 === "") {
          throw new Error("Game creation failed");
      }

      const {signature: stateSignature_createGame_ofPlayer2, hash: stateHash_createGame_ofPlayer2} = await gameStateChannel2.createGame(
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

      if (stateSignature_createGame_ofPlayer2 === "" || stateHash_createGame_ofPlayer2 === "") {
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
        timestamp: game.timestamp,
        lastMoveHash: game.lastMoveHash
      }
      
      const txSubmitInitialState_player1 = await battleshipWaku.connect(player1).submitInitialState(
        channelId,
        game_converted,
        stateSignature_createGame_ofPlayer1,
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
        stateSignature_createGame_ofPlayer1,
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
      
      const {hash: statehash_createGame, signature:stateSignature_createGame} = await gameStateChannel.createGame(
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

      const {hash: statehash_createGame2, signature:stateSignature_createGame2} = await gameStateChannel2.createGame(
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
        timestamp: game.timestamp,
        lastMoveHash: game.lastMoveHash
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
        
        const {signature: stateSignature_createGame_ofPlayer1, hash: stateHash_createGame_ofPlayer1} = await gameStateChannel.createGame(
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

        if (stateSignature_createGame_ofPlayer1 === "" || stateHash_createGame_ofPlayer1 === "") {
            throw new Error("Game creation failed");
        }

        const {signature: stateSignature_createGame_ofPlayer2, hash: stateHash_createGame_ofPlayer2} = await gameStateChannel2.createGame(
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

        if (stateSignature_createGame_ofPlayer2 === "" || stateHash_createGame_ofPlayer2 === "") {
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
          timestamp: game.timestamp,
          lastMoveHash: game.lastMoveHash
        }
        
        const txSubmitInitialState_player1 = await battleshipWaku.connect(player1).submitInitialState(
          channelId,
          game_converted,
          stateSignature_createGame_ofPlayer1,
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
          timestamp: game2.timestamp,
          lastMoveHash: game2.lastMoveHash
        }

        const txSubmitInitialState_player2 = await battleshipWaku.connect(player2).submitInitialState(
          channelId,
          game_converted2,
          stateSignature_createGame_ofPlayer2,
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
        
        // const gameState_Player2 = await battleshipWaku.getGameState(stateHash_player2);
        // console.log("Game state:: Player 2", gameState_Player2);

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
        let player2_moveStateHash = "";
        for (let i = 0; i < 12; i++) {

          // ======= FIRST MOVE ==========
          // PLAYER 1 MOVE
          // Player 1 makes a move. This computation is done at the player2's end in the actual game.
          console.log("Player 1 makes a move", i);
          const guessPlayer1 = player2ShipPositions[i];

          // PLAYER 2 CALCULATIONS
          // All these computations are done by player 2.
          const hit = 1;
          
          const moveInputPlayer1 = {
            salt: shipPlacementPositionsPlayer2.salt,
            ship_placement_commitment: shipPlacementPositionsPlayer2.commitment,
            previous_move_hash: i == 0? ethers.ZeroHash: player2_moveStateHash,
            move_count: i,
            game_id: "333",
            player_id: 0,
            board_state: shipPlacementPositionsPlayer2.board_state,
            guess_x: guessPlayer1[0],
            guess_y: guessPlayer1[1],
            hit: hit
          };
          // Player 2 generates the proof for the move made by Player 1
          const {proof: _proofMovePlayer1, calldata: proofMovePlayer1} = await gameStateChannel2.generateProof(moveInputPlayer1, moveWasmPath, moveZkeyPath);
          // console.log("proofMovePlayer1", proofMovePlayer1);
          // console.log("_proofMovePlayer1", _proofMovePlayer1);
          // console.log(proofPlayer1);
          // proofMovePlayer1_converted & _proofMovePlayer1 - To be sent to Player 1
          const proofMovePlayer1_converted = {
            pA: proofMovePlayer1[0],
            pB: proofMovePlayer1[1],
            pC: proofMovePlayer1[2],
            pubSignals: proofMovePlayer1[3]
          };
          console.log("proofMovePlayer1_converted", proofMovePlayer1_converted)
          // PLayer 2 verify locally if proofs are right and signs the current game state and shares it with the Player1
          const resultOffChainProof_byPlayer2 = await gameStateChannel2.verifyProof(moveVerification, _proofMovePlayer1);
          console.log("resultOffChainProof_byPlayer2", resultOffChainProof_byPlayer2);
          const resultOnChainProof_byPlayer2 = await moveVerifier.verifyProof(proofMovePlayer1_converted.pA, proofMovePlayer1_converted.pB, proofMovePlayer1_converted.pC, proofMovePlayer1_converted.pubSignals);
          console.log("resultOnChainProof_byPlayer2", resultOffChainProof_byPlayer2);

          // Check if local proof generations are okay. Else throw error from Player2's side.
          if(!resultOnChainProof_byPlayer2 || !resultOffChainProof_byPlayer2) {
            throw new Error("Move verification failed");
          } 

          // Updated the latest move hash
          console.log("Latest move hash from Player 2 for Player 1 : ", _proofMovePlayer1.publicSignals[6]);
          gameStateChannel2.updateLatestMoveHash(_proofMovePlayer1.publicSignals[6]);

          // Generate move data for Player 1
          const moveTimestamp = Math.floor(Date.now() / 1000);
          let move_player1_byPlayer2 = {
            x: guessPlayer1[0],
            y: guessPlayer1[1],
            isHit: hit,
            timestamp: moveTimestamp
          };

          // Make Move at player2's side
          await gameStateChannel2.makeMove(move_player1_byPlayer2);

          // PLAYER 2 SIGNS THE GAME STATE
          const {signature: currentStateSignature_ofPlayer2, hash: currentStateHash_ofPlayer2} = await gameStateChannel2.signGameState();
          console.log("Player 2 Signature: ", currentStateSignature_ofPlayer2);

          const latestGameState_fromPlayer2 = gameStateChannel2.getGameState();
          const latestGameStateSC_fromPlayer2 = {
            stateHash: latestGameState_fromPlayer2.stateHash,
            nonce: latestGameState_fromPlayer2.nonce,
            currentTurn: latestGameState_fromPlayer2.currentTurn,
            moveCount: latestGameState_fromPlayer2.moveCount,
            player1ShipCommitment: latestGameState_fromPlayer2.player1ShipCommitment,
            player2ShipCommitment: latestGameState_fromPlayer2.player2ShipCommitment,
            player1Hits: latestGameState_fromPlayer2.player1Hits,
            player2Hits: latestGameState_fromPlayer2.player2Hits,
            gameEnded: latestGameState_fromPlayer2.gameEnded,
            winner: latestGameState_fromPlayer2.winner,
            timestamp: latestGameState_fromPlayer2.timestamp,
            lastMoveHash: latestGameState_fromPlayer2.lastMoveHash
          };
          console.log("derived game state Player 2", latestGameStateSC_fromPlayer2);
          
          // PLAYER 2 SENDS THE MOVE DATA TO PLAYER 1
          // The move data to be sent to Player 1
          const movesData_player1_byPlayer2 = {
            move: move_player1_byPlayer2,
            signature: {
              player1: "",
              player2: currentStateSignature_ofPlayer2
            },
            gameState: latestGameStateSC_fromPlayer2,
            gameStateHash: currentStateHash_ofPlayer2,
            proofs: {proof: _proofMovePlayer1, calldata: proofMovePlayer1_converted}
          };

          // Verify if the values are correct locally at player 2's end
          let {isValid: resultGameStateSignaturePlayer2} = await gameStateChannel2.verifyGameStateSignature(movesData_player1_byPlayer2.signature.player2, player2.address, movesData_player1_byPlayer2.gameState);
          console.log("Move state signature verification player 1 at Player 2's side", resultGameStateSignaturePlayer2);

          if(!resultGameStateSignaturePlayer2) {
            throw new Error("Move state signature of Player 2 verification failed at Player 2's end! - LOCAL VERIFICATION!");
          }

          // PLAYER 1 VERIFICATION
 
          // Player 1 verifies the proof generated by Player 2
          let resultMovePlayer1 = await moveVerifier.verifyProof(proofMovePlayer1_converted.pA, proofMovePlayer1_converted.pB, proofMovePlayer1_converted.pC, proofMovePlayer1_converted.pubSignals);
          console.log("Move verification proof player 1 at Player 2's side", resultMovePlayer1);

          let offchainVerificationPlayer1 = await gameStateChannel.verifyProof(moveVerification, _proofMovePlayer1);
          console.log("Offchain move verification proof player 1 at Player 2's side", offchainVerificationPlayer1);

          let {isValid: resultGameStateSignaturePlayer1} = await gameStateChannel.verifyGameStateSignature(movesData_player1_byPlayer2.signature.player2, player2.address, movesData_player1_byPlayer2.gameState);
          console.log("Move state signature verification player 1 at Player 2's side", resultGameStateSignaturePlayer1);

          if(!resultGameStateSignaturePlayer1) {
            throw new Error("Move state signature of Player 2 verification failed at Player 1's end!");
          }

          // PLayer 1 calls the makeMove function and updates the state accordingly!
          const isMyTurn_player1 = await gameStateChannel.isMyTurn();
          let moveStateHash_player1 = "";
          if(isMyTurn_player1) {
            let {signature: moveStatehash, winnerFound: winnerFound1, winner: winner1} = await gameStateChannel.makeMove(movesData_player1_byPlayer2.move);
            moveStateHash_player1 = moveStatehash;
            if(winnerFound1) {
                console.log("Game Over");
                winnerDeclared = true;
                winner = winner1;
            }
          }

          // PLAYER 1 SIGNS THE GAME STATE
          let player1Signature_onPlayer2GameState = await gameStateChannel.signCustomGameState(movesData_player1_byPlayer2.gameState);
          console.log("Player 1 Signature: ", player1Signature_onPlayer2GameState);

          // PLAYER 1 SWITCHES TURN
          // If the move is valid, Player 2 acknowledges the move and shares the result back to Player 1
          if(resultMovePlayer1 && offchainVerificationPlayer1) {
            gameStateChannel.switchTurn();
          } else {
            // Should go for dispute in real world scenario
            throw new Error("Move verification failed");
          }

          // Player 1 updates the signature in the movesdata 
          movesData_player1_byPlayer2.signature.player1 = player1Signature_onPlayer2GameState;
          // Player 1 updates the moves using the data passed by Player 2
          await gameStateChannel.updateMoves(movesData_player1_byPlayer2);

          // No Dispute from Player 1

          // Player 1 shares the signature back with player 2

          // Player 2 verifies the signature with the gamestate
          let {isValid: resultGameStateSignature_ofPlayer1} = await gameStateChannel2.verifyGameStateSignature(movesData_player1_byPlayer2.signature.player1, player1.address, movesData_player1_byPlayer2.gameState);
          console.log("Move state signature verification player 1 at Player 2's side", resultGameStateSignature_ofPlayer1);

          if(!resultGameStateSignature_ofPlayer1) {
            throw new Error("Move state signature of Player 1 verification failed at Player 2's end!");
          }

          // Player 2 updates the gamestate 
          // Update the current move data for Player 1 at Player 2's side
          await gameStateChannel2.updateMoves(movesData_player1_byPlayer2);


          // Checks if the winner is declared
          if(winnerDeclared) {
            await gameStateChannel.declareWinner(winner);
            // This will be sent to player 2 and player 2 will update the state accordingly
            await gameStateChannel2.declareWinner(winner);
            break;
          }

          // No Dispute from Player 2
          
          // PLAYER 2 SWITCHES TURN
          // Switch turn to player 1 - This should be the last step to be done
          gameStateChannel2.switchTurn();

          // ======= SECOND MOVE ==========
          // PLAYER 2 MOVE
          // Player 2 makes a move. This computation is done at the player1's end in the actual game.
          console.log("Player 2 makes a move", i);
          const guessPlayer2 = player1ShipPositions[i];

          // PLAYER 1 COMPUTATIONS
          const hit2 = 1;
        
          const moveInputPlayer2 = {
            salt: shipPlacementPositionsPlayer1.salt,
            ship_placement_commitment: shipPlacementPositionsPlayer1.commitment,
            previous_move_hash: _proofMovePlayer1.publicSignals[6],
            move_count: i,
            game_id: "333",
            player_id: 1,
            board_state: shipPlacementPositionsPlayer1.board_state,
            guess_x: guessPlayer2[0],
            guess_y: guessPlayer2[1],
            hit: hit2
          };
          // Player 1 generates the proof for the move made by Player 2
          // Player 2 generates the proof for the move made by Player 1
          const {proof: _proofMovePlayer2, calldata: proofMovePlayer2} = await gameStateChannel.generateProof(moveInputPlayer2, moveWasmPath, moveZkeyPath);
          player2_moveStateHash = _proofMovePlayer2.publicSignals[6];
          // console.log(proofPlayer1);
          // proofMovePlayer1_converted & _proofMovePlayer1 - To be sent to Player 1
          const proofMovePlayer2_converted = {
            pA: proofMovePlayer2[0],
            pB: proofMovePlayer2[1],
            pC: proofMovePlayer2[2],
            pubSignals: proofMovePlayer2[3]
          };
          // PLayer 1 verify locally if proofs are right and signs the current game state and shares it with the Player2
          const resultOnChainProof_byPlayer1 = await gameStateChannel.verifyProof(moveVerification, _proofMovePlayer2);
          const resultOffChainProof_byPlayer1 = await moveVerifier.verifyProof(proofMovePlayer2_converted.pA, proofMovePlayer2_converted.pB, proofMovePlayer2_converted.pC, proofMovePlayer2_converted.pubSignals);

          // Check if local proof generations are okay. Else throw error from Player2's side.
          if(!resultOnChainProof_byPlayer1 || !resultOffChainProof_byPlayer1) {
            throw new Error("Move verification failed");
          } 

          gameStateChannel.updateLatestMoveHash(_proofMovePlayer2.publicSignals[6]);
          console.log("Latest move hash from Player 1 for Player 2 : ", _proofMovePlayer2.publicSignals[6]);

          // Generate move data for Player 1
          const moveTimestamp2 = Math.floor(Date.now() / 1000);
          let move_player2_byPlayer1 = {
            x: guessPlayer2[0],
            y: guessPlayer2[1],
            isHit: hit2,
            timestamp: moveTimestamp2
          };

          // Increment player2's hit count at Player 1's end
          await gameStateChannel.makeMove(move_player2_byPlayer1);

          const {signature: currentStateSignature_ofPlayer1, hash: currentStateHash_ofPlayer1} = await gameStateChannel.signGameState();
          console.log("Player 1 Signature: ", currentStateSignature_ofPlayer1);
          const latestGameState_fromPlayer1 = gameStateChannel.getGameState();
          const latestGameStateSC_fromPlayer1 = {
            stateHash: latestGameState_fromPlayer1.stateHash,
            nonce: latestGameState_fromPlayer1.nonce,
            currentTurn: latestGameState_fromPlayer1.currentTurn,
            moveCount: latestGameState_fromPlayer1.moveCount,
            player1ShipCommitment: latestGameState_fromPlayer1.player1ShipCommitment,
            player2ShipCommitment: latestGameState_fromPlayer1.player2ShipCommitment,
            player1Hits: latestGameState_fromPlayer1.player1Hits,
            player2Hits: latestGameState_fromPlayer1.player2Hits,
            gameEnded: latestGameState_fromPlayer1.gameEnded,
            winner: latestGameState_fromPlayer1.winner,
            timestamp: latestGameState_fromPlayer1.timestamp,
            lastMoveHash: latestGameState_fromPlayer1.lastMoveHash
          }
          console.log("derived game state Player 1", latestGameStateSC_fromPlayer1);
          
          // The move data to be sent to Player 1
          const movesData_player2_byPlayer1 = {
            move: move_player2_byPlayer1,
            signature: {
              player2: "",
              player1: currentStateSignature_ofPlayer1
            },
            gameState: latestGameStateSC_fromPlayer1,
            gameStateHash: currentStateHash_ofPlayer1,
            proofs: {proof: _proofMovePlayer2, calldata: proofMovePlayer2_converted}
          };

          let {isValid: resultGameStateSignaturePlayer3} = await gameStateChannel.verifyGameStateSignature(movesData_player2_byPlayer1.signature.player1, player1.address, movesData_player2_byPlayer1.gameState);
          console.log("Move state signature verification player 1 at Player 1's side - LOCAL VERIFICATION", resultGameStateSignaturePlayer3);

          if(!resultGameStateSignaturePlayer3) {
            throw new Error("Move state signature of Player 1 verification failed at Player 1's end! - LOCAL VERIFICATION");
          }

          // PLAYER 2 VERIFICATION

          // Player 2 verifies the proof generated by Player 1
          let resultMovePlayer2 = await moveVerifier.verifyProof(proofMovePlayer2_converted.pA, proofMovePlayer2_converted.pB, proofMovePlayer2_converted.pC, proofMovePlayer2_converted.pubSignals);
          console.log("Move verification proof player 2 at Player 1's side", resultMovePlayer2);

          let offchainVerificationPlayer2 = await gameStateChannel2.verifyProof(moveVerification, _proofMovePlayer2);
          console.log("Offchain move verification proof player 2 at Player 1's side", offchainVerificationPlayer2);

          let player2Signature_onPlayer1GameState  = await gameStateChannel2.signCustomGameState(movesData_player2_byPlayer1.gameState);
          movesData_player2_byPlayer1.signature.player2 = player2Signature_onPlayer1GameState;
          console.log("Player 2 Signature on Player 1's GameState: ", player2Signature_onPlayer1GameState)
          // PLayer 2 calls the makeMove function and updates the state accordingly!
          const isMyTurn_player2 = await gameStateChannel2.isMyTurn();
          let moveStateHash_player2 = "";
          if(isMyTurn_player2) {
            let {signature: moveStatehash, winnerFound: winnerFound2, winner: winner2} = await gameStateChannel2.makeMove(movesData_player2_byPlayer1.move);
            moveStateHash_player2 = moveStatehash;
            if(winnerFound2) {
                console.log("Game Over");
                winnerDeclared = true;
                winner = winner2;
            }
          }

          // PLAYER 2 SWITCH TURNS
          // If the move is valid, Player 2 acknowledges the move and shares the result back to Player 1
          if(resultMovePlayer2 && offchainVerificationPlayer2) {
            gameStateChannel2.switchTurn();
          } else {
            // Should go for dispute in real world scenario
            throw new Error("Move verification failed");
          }
          // Player 2 updates the moves using the data passed by Player 1
          await gameStateChannel2.updateMoves(movesData_player2_byPlayer1);

          let {isValid: resultGameStateSignaturePlayer4} = await gameStateChannel2.verifyGameStateSignature(movesData_player2_byPlayer1.signature.player1, player1.address, movesData_player2_byPlayer1.gameState);
          console.log("Move state signature verification player 1 at Player 2's side", resultGameStateSignaturePlayer4);

          if(!resultGameStateSignaturePlayer4) {
            throw new Error("Move state signature of Player 1 verification failed at Player 2's end!");
          }
          
          // PLayer 1 verifies the signature of GameState by Player 2
          let {isValid: resultGameStateSignaturePlayer5} = await gameStateChannel.verifyGameStateSignature(movesData_player2_byPlayer1.signature.player2, player2.address, movesData_player2_byPlayer1.gameState);
          console.log("Move state signature verification player 2 at Player 1's side", resultGameStateSignaturePlayer5);

          if(!resultGameStateSignaturePlayer5) {
            throw new Error("Move state signature of Player 2 verification failed at Player 1's end!");
          }
          // player 1 Switch turn to player2
          gameStateChannel.switchTurn();

          // Update the current move data for Player 2 at Player 1's side
          await gameStateChannel.updateMoves(movesData_player2_byPlayer1);

          // Checks if the winner is declared
          if(winnerDeclared) {
            await gameStateChannel.declareWinner(winner);
            await gameStateChannel2.declareWinner(winner);
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
          hit_count: gameStateChannel.gameState.player1Hits,
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

        let player1_gs = await gameStateChannel.getGameState();
        let player2_gs = await gameStateChannel2.getGameState();

        // Get the final GameState signed by Player2 also

        const finalGameState = player2_gs.movesData[player2_gs.movesData.length - 1];
        console.log("finalGameState", finalGameState);

        const finalGameStateObj = {
          nonce: finalGameState.gameState.nonce,
          currentTurn: finalGameState.gameState.currentTurn,
          moveCount: finalGameState.gameState.moveCount,
          player1ShipCommitment: finalGameState.gameState.player1ShipCommitment,
          player2ShipCommitment: finalGameState.gameState.player2ShipCommitment,
          player1Hits: finalGameState.gameState.player1Hits,
          player2Hits: finalGameState.gameState.player2Hits,
          gameEnded: finalGameState.gameState.gameEnded,
          winner: finalGameState.gameState.winner,
          timestamp: finalGameState.gameState.timestamp,
          lastMoveHash: finalGameState.gameState.lastMoveHash
        };
        
        console.log(finalGameStateObj);
        // Settle the channel
        await expect(battleshipWaku.connect(player1).settleChannel(
          Number(channelId),
          finalGameStateObj,
          finalGameState.signature.player1,
          finalGameState.signature.player2,
          proofWinPlayer1_converted
        )).to.emit(battleshipWaku, "ChannelSettled").withArgs(channelId, player1.address);
        
    });

  });

  describe("Dispute Resolution System", function () {
    it("Should handle dispute initiation and timeout", async function () {
      
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
        
        const {signature: stateSignature_createGame_ofPlayer1, hash: stateHash_createGame_ofPlayer1} = await gameStateChannel.createGame(
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

        if (stateSignature_createGame_ofPlayer1 === "" || stateHash_createGame_ofPlayer1 === "") {
            throw new Error("Game creation failed");
        }

        const {signature: stateSignature_createGame_ofPlayer2, hash: stateHash_createGame_ofPlayer2} = await gameStateChannel2.createGame(
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

        if (stateSignature_createGame_ofPlayer2 === "" || stateHash_createGame_ofPlayer2 === "") {
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
          timestamp: game.timestamp,
          lastMoveHash: game.lastMoveHash
        }
        
        const txSubmitInitialState_player1 = await battleshipWaku.connect(player1).submitInitialState(
          channelId,
          game_converted,
          stateSignature_createGame_ofPlayer1,
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
          timestamp: game2.timestamp,
          lastMoveHash: game2.lastMoveHash
        }

        const txSubmitInitialState_player2 = await battleshipWaku.connect(player2).submitInitialState(
          channelId,
          game_converted2,
          stateSignature_createGame_ofPlayer2,
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
        
        // const gameState_Player2 = await battleshipWaku.getGameState(stateHash_player2);
        // console.log("Game state:: Player 2", gameState_Player2);

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
        let player2_moveStateHash = "";
        for (let i = 0; i < 12; i++) {

          // ======= FIRST MOVE ==========
          // PLAYER 1 MOVE
          // Player 1 makes a move. This computation is done at the player2's end in the actual game.
          console.log("Player 1 makes a move", i);
          const guessPlayer1 = player2ShipPositions[i];

          // PLAYER 2 CALCULATIONS
          // All these computations are done by player 2.
          const hit = 1;
          
          const moveInputPlayer1 = {
            salt: shipPlacementPositionsPlayer2.salt,
            ship_placement_commitment: shipPlacementPositionsPlayer2.commitment,
            previous_move_hash: i == 0? ethers.ZeroHash: player2_moveStateHash,
            move_count: i,
            game_id: "333",
            player_id: 0,
            board_state: shipPlacementPositionsPlayer2.board_state,
            guess_x: guessPlayer1[0],
            guess_y: guessPlayer1[1],
            hit: hit
          };
          // Player 2 generates the proof for the move made by Player 1
          const {proof: _proofMovePlayer1, calldata: proofMovePlayer1} = await gameStateChannel2.generateProof(moveInputPlayer1, moveWasmPath, moveZkeyPath);
          // console.log("proofMovePlayer1", proofMovePlayer1);
          // console.log("_proofMovePlayer1", _proofMovePlayer1);
          // console.log(proofPlayer1);
          // proofMovePlayer1_converted & _proofMovePlayer1 - To be sent to Player 1
          const proofMovePlayer1_converted = {
            pA: proofMovePlayer1[0],
            pB: proofMovePlayer1[1],
            pC: proofMovePlayer1[2],
            pubSignals: proofMovePlayer1[3]
          };
          console.log("proofMovePlayer1_converted", proofMovePlayer1_converted)
          // PLayer 2 verify locally if proofs are right and signs the current game state and shares it with the Player1
          const resultOffChainProof_byPlayer2 = await gameStateChannel2.verifyProof(moveVerification, _proofMovePlayer1);
          console.log("resultOffChainProof_byPlayer2", resultOffChainProof_byPlayer2);
          const resultOnChainProof_byPlayer2 = await moveVerifier.verifyProof(proofMovePlayer1_converted.pA, proofMovePlayer1_converted.pB, proofMovePlayer1_converted.pC, proofMovePlayer1_converted.pubSignals);
          console.log("resultOnChainProof_byPlayer2", resultOffChainProof_byPlayer2);

          // Check if local proof generations are okay. Else throw error from Player2's side.
          if(!resultOnChainProof_byPlayer2 || !resultOffChainProof_byPlayer2) {
            throw new Error("Move verification failed");
          } 

          // Updated the latest move hash
          console.log("Latest move hash from Player 2 for Player 1 : ", _proofMovePlayer1.publicSignals[6]);
          gameStateChannel2.updateLatestMoveHash(_proofMovePlayer1.publicSignals[6]);

          // Generate move data for Player 1
          const moveTimestamp = Math.floor(Date.now() / 1000);
          let move_player1_byPlayer2 = {
            x: guessPlayer1[0],
            y: guessPlayer1[1],
            isHit: hit,
            timestamp: moveTimestamp
          };

          // Make Move at player2's side
          await gameStateChannel2.makeMove(move_player1_byPlayer2);

          // PLAYER 2 SIGNS THE GAME STATE
          const {signature: currentStateSignature_ofPlayer2, hash: currentStateHash_ofPlayer2} = await gameStateChannel2.signGameState();
          console.log("Player 2 Signature: ", currentStateSignature_ofPlayer2);

          const latestGameState_fromPlayer2 = gameStateChannel2.getGameState();
          const latestGameStateSC_fromPlayer2 = {
            stateHash: latestGameState_fromPlayer2.stateHash,
            nonce: latestGameState_fromPlayer2.nonce,
            currentTurn: latestGameState_fromPlayer2.currentTurn,
            moveCount: latestGameState_fromPlayer2.moveCount,
            player1ShipCommitment: latestGameState_fromPlayer2.player1ShipCommitment,
            player2ShipCommitment: latestGameState_fromPlayer2.player2ShipCommitment,
            player1Hits: latestGameState_fromPlayer2.player1Hits,
            player2Hits: latestGameState_fromPlayer2.player2Hits,
            gameEnded: latestGameState_fromPlayer2.gameEnded,
            winner: latestGameState_fromPlayer2.winner,
            timestamp: latestGameState_fromPlayer2.timestamp,
            lastMoveHash: latestGameState_fromPlayer2.lastMoveHash
          };
          console.log("derived game state Player 2", latestGameStateSC_fromPlayer2);
          
          // PLAYER 2 SENDS THE MOVE DATA TO PLAYER 1
          // The move data to be sent to Player 1
          const movesData_player1_byPlayer2 = {
            move: move_player1_byPlayer2,
            signature: {
              player1: "",
              player2: currentStateSignature_ofPlayer2
            },
            gameState: latestGameStateSC_fromPlayer2,
            gameStateHash: currentStateHash_ofPlayer2,
            proofs: {proof: _proofMovePlayer1, calldata: proofMovePlayer1_converted}
          };

          // Verify if the values are correct locally at player 2's end
          let {isValid: resultGameStateSignaturePlayer2} = await gameStateChannel2.verifyGameStateSignature(movesData_player1_byPlayer2.signature.player2, player2.address, movesData_player1_byPlayer2.gameState);
          console.log("Move state signature verification player 1 at Player 2's side", resultGameStateSignaturePlayer2);

          if(!resultGameStateSignaturePlayer2) {
            throw new Error("Move state signature of Player 2 verification failed at Player 2's end! - LOCAL VERIFICATION!");
          }

          // PLAYER 1 VERIFICATION
 
          // Player 1 verifies the proof generated by Player 2
          let resultMovePlayer1 = await moveVerifier.verifyProof(proofMovePlayer1_converted.pA, proofMovePlayer1_converted.pB, proofMovePlayer1_converted.pC, proofMovePlayer1_converted.pubSignals);
          console.log("Move verification proof player 1 at Player 2's side", resultMovePlayer1);

          let offchainVerificationPlayer1 = await gameStateChannel.verifyProof(moveVerification, _proofMovePlayer1);
          console.log("Offchain move verification proof player 1 at Player 2's side", offchainVerificationPlayer1);

          let {isValid: resultGameStateSignaturePlayer1} = await gameStateChannel.verifyGameStateSignature(movesData_player1_byPlayer2.signature.player2, player2.address, movesData_player1_byPlayer2.gameState);
          console.log("Move state signature verification player 1 at Player 2's side", resultGameStateSignaturePlayer1);

          if(!resultGameStateSignaturePlayer1) {
            throw new Error("Move state signature of Player 2 verification failed at Player 1's end!");
          }

          // PLayer 1 calls the makeMove function and updates the state accordingly!
          const isMyTurn_player1 = await gameStateChannel.isMyTurn();
          let moveStateHash_player1 = "";
          if(isMyTurn_player1) {
            let {signature: moveStatehash, winnerFound: winnerFound1, winner: winner1} = await gameStateChannel.makeMove(movesData_player1_byPlayer2.move);
            moveStateHash_player1 = moveStatehash;
            if(winnerFound1) {
                console.log("Game Over");
                winnerDeclared = true;
                winner = winner1;
            }
          }

          // PLAYER 1 SIGNS THE GAME STATE
          let player1Signature_onPlayer2GameState = await gameStateChannel.signCustomGameState(movesData_player1_byPlayer2.gameState);
          console.log("Player 1 Signature: ", player1Signature_onPlayer2GameState);

          // PLAYER 1 SWITCHES TURN
          // If the move is valid, Player 2 acknowledges the move and shares the result back to Player 1
          if(resultMovePlayer1 && offchainVerificationPlayer1) {
            gameStateChannel.switchTurn();
          } else {
            // Should go for dispute in real world scenario
            throw new Error("Move verification failed");
          }

          // Player 1 updates the signature in the movesdata 
          movesData_player1_byPlayer2.signature.player1 = player1Signature_onPlayer2GameState;
          // Player 1 updates the moves using the data passed by Player 2
          await gameStateChannel.updateMoves(movesData_player1_byPlayer2);

          // No Dispute from Player 1

          // Player 1 shares the signature back with player 2

          // Player 2 verifies the signature with the gamestate
          let {isValid: resultGameStateSignature_ofPlayer1} = await gameStateChannel2.verifyGameStateSignature(movesData_player1_byPlayer2.signature.player1, player1.address, movesData_player1_byPlayer2.gameState);
          console.log("Move state signature verification player 1 at Player 2's side", resultGameStateSignature_ofPlayer1);

          if(!resultGameStateSignature_ofPlayer1) {
            throw new Error("Move state signature of Player 1 verification failed at Player 2's end!");
          }

          // Player 2 updates the gamestate 
          // Update the current move data for Player 1 at Player 2's side
          await gameStateChannel2.updateMoves(movesData_player1_byPlayer2);


          // Checks if the winner is declared
          if(winnerDeclared) {
            await gameStateChannel.declareWinner(winner);
            // This will be sent to player 2 and player 2 will update the state accordingly
            await gameStateChannel2.declareWinner(winner);
            break;
          }

          // No Dispute from Player 2
          
          // PLAYER 2 SWITCHES TURN
          // Switch turn to player 1 - This should be the last step to be done
          gameStateChannel2.switchTurn();

          // ======= SECOND MOVE ==========
          // PLAYER 2 MOVE
          // Player 2 makes a move. This computation is done at the player1's end in the actual game.
          console.log("Player 2 makes a move", i);
          const guessPlayer2 = player1ShipPositions[i];

          // PLAYER 1 COMPUTATIONS
          const hit2 = 1;
        
          const moveInputPlayer2 = {
            salt: shipPlacementPositionsPlayer1.salt,
            ship_placement_commitment: shipPlacementPositionsPlayer1.commitment,
            previous_move_hash: _proofMovePlayer1.publicSignals[6],
            move_count: i,
            game_id: "333",
            player_id: 1,
            board_state: shipPlacementPositionsPlayer1.board_state,
            guess_x: guessPlayer2[0],
            guess_y: guessPlayer2[1],
            hit: hit2
          };
          // Player 1 generates the proof for the move made by Player 2
          // Player 2 generates the proof for the move made by Player 1
          const {proof: _proofMovePlayer2, calldata: proofMovePlayer2} = await gameStateChannel.generateProof(moveInputPlayer2, moveWasmPath, moveZkeyPath);
          player2_moveStateHash = _proofMovePlayer2.publicSignals[6];
          // console.log(proofPlayer1);
          // proofMovePlayer1_converted & _proofMovePlayer1 - To be sent to Player 1
          const proofMovePlayer2_converted = {
            pA: proofMovePlayer2[0],
            pB: proofMovePlayer2[1],
            pC: proofMovePlayer2[2],
            pubSignals: proofMovePlayer2[3]
          };
          // PLayer 1 verify locally if proofs are right and signs the current game state and shares it with the Player2
          const resultOnChainProof_byPlayer1 = await gameStateChannel.verifyProof(moveVerification, _proofMovePlayer2);
          const resultOffChainProof_byPlayer1 = await moveVerifier.verifyProof(proofMovePlayer2_converted.pA, proofMovePlayer2_converted.pB, proofMovePlayer2_converted.pC, proofMovePlayer2_converted.pubSignals);

          // Check if local proof generations are okay. Else throw error from Player2's side.
          if(!resultOnChainProof_byPlayer1 || !resultOffChainProof_byPlayer1) {
            throw new Error("Move verification failed");
          } 

          gameStateChannel.updateLatestMoveHash(_proofMovePlayer2.publicSignals[6]);
          console.log("Latest move hash from Player 1 for Player 2 : ", _proofMovePlayer2.publicSignals[6]);

          // Generate move data for Player 1
          const moveTimestamp2 = Math.floor(Date.now() / 1000);
          let move_player2_byPlayer1 = {
            x: guessPlayer2[0],
            y: guessPlayer2[1],
            isHit: hit2,
            timestamp: moveTimestamp2
          };

          // Increment player2's hit count at Player 1's end
          await gameStateChannel.makeMove(move_player2_byPlayer1);

          const {signature: currentStateSignature_ofPlayer1, hash: currentStateHash_ofPlayer1} = await gameStateChannel.signGameState();
          console.log("Player 1 Signature: ", currentStateSignature_ofPlayer1);
          const latestGameState_fromPlayer1 = gameStateChannel.getGameState();
          const latestGameStateSC_fromPlayer1 = {
            stateHash: latestGameState_fromPlayer1.stateHash,
            nonce: latestGameState_fromPlayer1.nonce,
            currentTurn: latestGameState_fromPlayer1.currentTurn,
            moveCount: latestGameState_fromPlayer1.moveCount,
            player1ShipCommitment: latestGameState_fromPlayer1.player1ShipCommitment,
            player2ShipCommitment: latestGameState_fromPlayer1.player2ShipCommitment,
            player1Hits: latestGameState_fromPlayer1.player1Hits,
            player2Hits: latestGameState_fromPlayer1.player2Hits,
            gameEnded: latestGameState_fromPlayer1.gameEnded,
            winner: latestGameState_fromPlayer1.winner,
            timestamp: latestGameState_fromPlayer1.timestamp,
            lastMoveHash: latestGameState_fromPlayer1.lastMoveHash
          }
          console.log("derived game state Player 1", latestGameStateSC_fromPlayer1);
          
          // The move data to be sent to Player 1
          const movesData_player2_byPlayer1 = {
            move: move_player2_byPlayer1,
            signature: {
              player2: "",
              player1: currentStateSignature_ofPlayer1
            },
            gameState: latestGameStateSC_fromPlayer1,
            gameStateHash: currentStateHash_ofPlayer1,
            proofs: {proof: _proofMovePlayer2, calldata: proofMovePlayer2_converted}
          };

          let {isValid: resultGameStateSignaturePlayer3} = await gameStateChannel.verifyGameStateSignature(movesData_player2_byPlayer1.signature.player1, player1.address, movesData_player2_byPlayer1.gameState);
          console.log("Move state signature verification player 1 at Player 1's side - LOCAL VERIFICATION", resultGameStateSignaturePlayer3);

          if(!resultGameStateSignaturePlayer3) {
            throw new Error("Move state signature of Player 1 verification failed at Player 1's end! - LOCAL VERIFICATION");
          }

          // PLAYER 2 VERIFICATION

          // Player 2 verifies the proof generated by Player 1
          let resultMovePlayer2 = await moveVerifier.verifyProof(proofMovePlayer2_converted.pA, proofMovePlayer2_converted.pB, proofMovePlayer2_converted.pC, proofMovePlayer2_converted.pubSignals);
          console.log("Move verification proof player 2 at Player 1's side", resultMovePlayer2);

          let offchainVerificationPlayer2 = await gameStateChannel2.verifyProof(moveVerification, _proofMovePlayer2);
          console.log("Offchain move verification proof player 2 at Player 1's side", offchainVerificationPlayer2);

          let player2Signature_onPlayer1GameState  = await gameStateChannel2.signCustomGameState(movesData_player2_byPlayer1.gameState);
          movesData_player2_byPlayer1.signature.player2 = player2Signature_onPlayer1GameState;
          console.log("Player 2 Signature on Player 1's GameState: ", player2Signature_onPlayer1GameState)
          // PLayer 2 calls the makeMove function and updates the state accordingly!
          const isMyTurn_player2 = await gameStateChannel2.isMyTurn();
          let moveStateHash_player2 = "";
          if(isMyTurn_player2) {
            let {signature: moveStatehash, winnerFound: winnerFound2, winner: winner2} = await gameStateChannel2.makeMove(movesData_player2_byPlayer1.move);
            moveStateHash_player2 = moveStatehash;
            if(winnerFound2) {
                console.log("Game Over");
                winnerDeclared = true;
                winner = winner2;
            }
          }

          // PLAYER 2 SWITCH TURNS
          // If the move is valid, Player 2 acknowledges the move and shares the result back to Player 1
          if(resultMovePlayer2 && offchainVerificationPlayer2) {
            gameStateChannel2.switchTurn();
          } else {
            // Should go for dispute in real world scenario
            throw new Error("Move verification failed");
          }
          // Player 2 updates the moves using the data passed by Player 1
          await gameStateChannel2.updateMoves(movesData_player2_byPlayer1);

          let {isValid: resultGameStateSignaturePlayer4} = await gameStateChannel2.verifyGameStateSignature(movesData_player2_byPlayer1.signature.player1, player1.address, movesData_player2_byPlayer1.gameState);
          console.log("Move state signature verification player 1 at Player 2's side", resultGameStateSignaturePlayer4);

          if(!resultGameStateSignaturePlayer4) {
            throw new Error("Move state signature of Player 1 verification failed at Player 2's end!");
          }
          
          // PLayer 1 verifies the signature of GameState by Player 2
          let {isValid: resultGameStateSignaturePlayer5} = await gameStateChannel.verifyGameStateSignature(movesData_player2_byPlayer1.signature.player2, player2.address, movesData_player2_byPlayer1.gameState);
          console.log("Move state signature verification player 2 at Player 1's side", resultGameStateSignaturePlayer5);

          if(!resultGameStateSignaturePlayer5) {
            throw new Error("Move state signature of Player 2 verification failed at Player 1's end!");
          }
          // player 1 Switch turn to player2
          gameStateChannel.switchTurn();

          // Update the current move data for Player 2 at Player 1's side
          await gameStateChannel.updateMoves(movesData_player2_byPlayer1);

          // Checks if the winner is declared
          if(winnerDeclared) {
            await gameStateChannel.declareWinner(winner);
            await gameStateChannel2.declareWinner(winner);
            break;
          }

          if(i == 2) {
            // for testing purposes
            break;
          }

        }
        const player2_gs = await gameStateChannel2.getGameState();
        const disputedGameState = player2_gs.movesData[player2_gs.movesData.length - 1];

        const disputedGameStateObj = {
          nonce: disputedGameState.gameState.nonce,
          currentTurn: disputedGameState.gameState.currentTurn,
          moveCount: disputedGameState.gameState.moveCount,
          player1ShipCommitment: disputedGameState.gameState.player1ShipCommitment,
          player2ShipCommitment: disputedGameState.gameState.player2ShipCommitment,
          player1Hits: disputedGameState.gameState.player1Hits,
          player2Hits: disputedGameState.gameState.player2Hits,
          gameEnded: disputedGameState.gameState.gameEnded,
          winner: disputedGameState.gameState.winner,
          timestamp: disputedGameState.gameState.timestamp,
          lastMoveHash: disputedGameState.gameState.lastMoveHash
        };

        const {hash: disputedStateHash, signature: disputedStateSignature} = await gameStateChannel2.signGameState();
        console.log(disputedGameState.signature.player2);
        console.log(disputedStateSignature);
        console.log("Object ", disputedGameState);
        console.log({
          channelId: Number(channelId),
          disputeType: gameStateChannel2.DisputeType.InvalidMove, // DisputeType.InvalidMove
          gameState: disputedGameStateObj,
          player1Signature: disputedGameState.signature.player1,
          player2Signature: disputedGameState.signature.player2,
          disputedStateHash
        })
        // Initiate dispute
        await expect(battleshipWaku.connect(player2).initiateDispute(
          Number(channelId),
          gameStateChannel2.DisputeType.InvalidMove, // DisputeType.InvalidMove
          disputedGameStateObj,
          disputedGameState.signature.player1,
          disputedGameState.signature.player2,
          disputedStateHash
        )).to.emit(battleshipWaku, "DisputeInitiated").withArgs(
          1, 1, player2.address, 0
        );

        await time.increase(2200); // more than 5Minutes(300 seconds) * 7 minutes

        await expect(battleshipWaku.connect(player1).claimTimeout(
          Number(channelId)
        )).to.emit(battleshipWaku, "TimeoutClaimed").withArgs(
          1, player1.address
        );
    });

    it("Should handle Invalid Proof dispute and counter-state response with winner declaration", async function () {
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
      
      const {signature: stateSignature_createGame_ofPlayer1, hash: stateHash_createGame_ofPlayer1} = await gameStateChannel.createGame(
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

      if (stateSignature_createGame_ofPlayer1 === "" || stateHash_createGame_ofPlayer1 === "") {
          throw new Error("Game creation failed");
      }

      const {signature: stateSignature_createGame_ofPlayer2, hash: stateHash_createGame_ofPlayer2} = await gameStateChannel2.createGame(
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

      if (stateSignature_createGame_ofPlayer2 === "" || stateHash_createGame_ofPlayer2 === "") {
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
        timestamp: game.timestamp,
        lastMoveHash: game.lastMoveHash
      }
      
      const txSubmitInitialState_player1 = await battleshipWaku.connect(player1).submitInitialState(
        channelId,
        game_converted,
        stateSignature_createGame_ofPlayer1,
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
        timestamp: game2.timestamp,
        lastMoveHash: game2.lastMoveHash
      }

      const txSubmitInitialState_player2 = await battleshipWaku.connect(player2).submitInitialState(
        channelId,
        game_converted2,
        stateSignature_createGame_ofPlayer2,
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
      
      // const gameState_Player2 = await battleshipWaku.getGameState(stateHash_player2);
      // console.log("Game state:: Player 2", gameState_Player2);

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
      let player2_moveStateHash = "";
      for (let i = 0; i < 12; i++) {

        // ======= FIRST MOVE ==========
        // PLAYER 1 MOVE
        // Player 1 makes a move. This computation is done at the player2's end in the actual game.
        console.log("Player 1 makes a move", i);
        const guessPlayer1 = player2ShipPositions[i];

        // PLAYER 2 CALCULATIONS
        // All these computations are done by player 2.
        const hit = 1;
        
        const moveInputPlayer1 = {
          salt: shipPlacementPositionsPlayer2.salt,
          ship_placement_commitment: shipPlacementPositionsPlayer2.commitment,
          previous_move_hash: i == 0? ethers.ZeroHash: player2_moveStateHash,
          move_count: i,
          game_id: "333",
          player_id: 0,
          board_state: shipPlacementPositionsPlayer2.board_state,
          guess_x: guessPlayer1[0],
          guess_y: guessPlayer1[1],
          hit: hit
        };
        // Player 2 generates the proof for the move made by Player 1
        const {proof: _proofMovePlayer1, calldata: proofMovePlayer1} = await gameStateChannel2.generateProof(moveInputPlayer1, moveWasmPath, moveZkeyPath);
        // console.log("proofMovePlayer1", proofMovePlayer1);
        // console.log("_proofMovePlayer1", _proofMovePlayer1);
        // console.log(proofPlayer1);
        // proofMovePlayer1_converted & _proofMovePlayer1 - To be sent to Player 1
        const proofMovePlayer1_converted = {
          pA: proofMovePlayer1[0],
          pB: proofMovePlayer1[1],
          pC: proofMovePlayer1[2],
          pubSignals: proofMovePlayer1[3]
        };
        console.log("proofMovePlayer1_converted", proofMovePlayer1_converted)
        // PLayer 2 verify locally if proofs are right and signs the current game state and shares it with the Player1
        const resultOffChainProof_byPlayer2 = await gameStateChannel2.verifyProof(moveVerification, _proofMovePlayer1);
        console.log("resultOffChainProof_byPlayer2", resultOffChainProof_byPlayer2);
        const resultOnChainProof_byPlayer2 = await moveVerifier.verifyProof(proofMovePlayer1_converted.pA, proofMovePlayer1_converted.pB, proofMovePlayer1_converted.pC, proofMovePlayer1_converted.pubSignals);
        console.log("resultOnChainProof_byPlayer2", resultOffChainProof_byPlayer2);

        // Check if local proof generations are okay. Else throw error from Player2's side.
        if(!resultOnChainProof_byPlayer2 || !resultOffChainProof_byPlayer2) {
          throw new Error("Move verification failed");
        } 

        // Updated the latest move hash
        console.log("Latest move hash from Player 2 for Player 1 : ", _proofMovePlayer1.publicSignals[6]);
        gameStateChannel2.updateLatestMoveHash(_proofMovePlayer1.publicSignals[6]);

        // Generate move data for Player 1
        const moveTimestamp = Math.floor(Date.now() / 1000);
        let move_player1_byPlayer2 = {
          x: guessPlayer1[0],
          y: guessPlayer1[1],
          isHit: hit,
          timestamp: moveTimestamp
        };

        // Make Move at player2's side
        await gameStateChannel2.makeMove(move_player1_byPlayer2);

        // PLAYER 2 SIGNS THE GAME STATE
        const {signature: currentStateSignature_ofPlayer2, hash: currentStateHash_ofPlayer2} = await gameStateChannel2.signGameState();
        console.log("Player 2 Signature: ", currentStateSignature_ofPlayer2);

        const latestGameState_fromPlayer2 = gameStateChannel2.getGameState();
        const latestGameStateSC_fromPlayer2 = {
          stateHash: latestGameState_fromPlayer2.stateHash,
          nonce: latestGameState_fromPlayer2.nonce,
          currentTurn: latestGameState_fromPlayer2.currentTurn,
          moveCount: latestGameState_fromPlayer2.moveCount,
          player1ShipCommitment: latestGameState_fromPlayer2.player1ShipCommitment,
          player2ShipCommitment: latestGameState_fromPlayer2.player2ShipCommitment,
          player1Hits: latestGameState_fromPlayer2.player1Hits,
          player2Hits: latestGameState_fromPlayer2.player2Hits,
          gameEnded: latestGameState_fromPlayer2.gameEnded,
          winner: latestGameState_fromPlayer2.winner,
          timestamp: latestGameState_fromPlayer2.timestamp,
          lastMoveHash: latestGameState_fromPlayer2.lastMoveHash
        };
        console.log("derived game state Player 2", latestGameStateSC_fromPlayer2);
        
        // PLAYER 2 SENDS THE MOVE DATA TO PLAYER 1
        // The move data to be sent to Player 1
        const movesData_player1_byPlayer2 = {
          move: move_player1_byPlayer2,
          signature: {
            player1: "",
            player2: currentStateSignature_ofPlayer2
          },
          gameState: latestGameStateSC_fromPlayer2,
          gameStateHash: currentStateHash_ofPlayer2,
          proofs: {proof: _proofMovePlayer1, calldata: proofMovePlayer1_converted}
        };

        // Verify if the values are correct locally at player 2's end
        let {isValid: resultGameStateSignaturePlayer2} = await gameStateChannel2.verifyGameStateSignature(movesData_player1_byPlayer2.signature.player2, player2.address, movesData_player1_byPlayer2.gameState);
        console.log("Move state signature verification player 1 at Player 2's side", resultGameStateSignaturePlayer2);

        if(!resultGameStateSignaturePlayer2) {
          throw new Error("Move state signature of Player 2 verification failed at Player 2's end! - LOCAL VERIFICATION!");
        }

        // PLAYER 1 VERIFICATION

        // Player 1 verifies the proof generated by Player 2
        let resultMovePlayer1 = await moveVerifier.verifyProof(proofMovePlayer1_converted.pA, proofMovePlayer1_converted.pB, proofMovePlayer1_converted.pC, proofMovePlayer1_converted.pubSignals);
        console.log("Move verification proof player 1 at Player 2's side", resultMovePlayer1);

        let offchainVerificationPlayer1 = await gameStateChannel.verifyProof(moveVerification, _proofMovePlayer1);
        console.log("Offchain move verification proof player 1 at Player 2's side", offchainVerificationPlayer1);

        let {isValid: resultGameStateSignaturePlayer1} = await gameStateChannel.verifyGameStateSignature(movesData_player1_byPlayer2.signature.player2, player2.address, movesData_player1_byPlayer2.gameState);
        console.log("Move state signature verification player 1 at Player 2's side", resultGameStateSignaturePlayer1);

        if(!resultGameStateSignaturePlayer1) {
          throw new Error("Move state signature of Player 2 verification failed at Player 1's end!");
        }

        // PLayer 1 calls the makeMove function and updates the state accordingly!
        const isMyTurn_player1 = await gameStateChannel.isMyTurn();
        let moveStateHash_player1 = "";
        if(isMyTurn_player1) {
          let {signature: moveStatehash, winnerFound: winnerFound1, winner: winner1} = await gameStateChannel.makeMove(movesData_player1_byPlayer2.move);
          moveStateHash_player1 = moveStatehash;
          if(winnerFound1) {
              console.log("Game Over");
              winnerDeclared = true;
              winner = winner1;
          }
        }

        // PLAYER 1 SIGNS THE GAME STATE
        let player1Signature_onPlayer2GameState = await gameStateChannel.signCustomGameState(movesData_player1_byPlayer2.gameState);
        console.log("Player 1 Signature: ", player1Signature_onPlayer2GameState);

        // PLAYER 1 SWITCHES TURN
        // If the move is valid, Player 2 acknowledges the move and shares the result back to Player 1
        if(resultMovePlayer1 && offchainVerificationPlayer1) {
          gameStateChannel.switchTurn();
        } else {
          // Should go for dispute in real world scenario
          throw new Error("Move verification failed");
        }

        // Player 1 updates the signature in the movesdata 
        movesData_player1_byPlayer2.signature.player1 = player1Signature_onPlayer2GameState;
        // Player 1 updates the moves using the data passed by Player 2
        await gameStateChannel.updateMoves(movesData_player1_byPlayer2);

        // No Dispute from Player 1

        // Player 1 shares the signature back with player 2

        // Player 2 verifies the signature with the gamestate
        let {isValid: resultGameStateSignature_ofPlayer1} = await gameStateChannel2.verifyGameStateSignature(movesData_player1_byPlayer2.signature.player1, player1.address, movesData_player1_byPlayer2.gameState);
        console.log("Move state signature verification player 1 at Player 2's side", resultGameStateSignature_ofPlayer1);

        if(!resultGameStateSignature_ofPlayer1) {
          throw new Error("Move state signature of Player 1 verification failed at Player 2's end!");
        }

        // Player 2 updates the gamestate 
        // Update the current move data for Player 1 at Player 2's side
        await gameStateChannel2.updateMoves(movesData_player1_byPlayer2);


        // Checks if the winner is declared
        if(winnerDeclared) {
          await gameStateChannel.declareWinner(winner);
          // This will be sent to player 2 and player 2 will update the state accordingly
          await gameStateChannel2.declareWinner(winner);
          break;
        }

        // No Dispute from Player 2
        
        // PLAYER 2 SWITCHES TURN
        // Switch turn to player 1 - This should be the last step to be done
        gameStateChannel2.switchTurn();

        // ======= SECOND MOVE ==========
        // PLAYER 2 MOVE
        // Player 2 makes a move. This computation is done at the player1's end in the actual game.
        console.log("Player 2 makes a move", i);
        const guessPlayer2 = player1ShipPositions[i];

        // PLAYER 1 COMPUTATIONS
        const hit2 = 1;
      
        const moveInputPlayer2 = {
          salt: shipPlacementPositionsPlayer1.salt,
          ship_placement_commitment: shipPlacementPositionsPlayer1.commitment,
          previous_move_hash: _proofMovePlayer1.publicSignals[6],
          move_count: i,
          game_id: "333",
          player_id: 1,
          board_state: shipPlacementPositionsPlayer1.board_state,
          guess_x: guessPlayer2[0],
          guess_y: guessPlayer2[1],
          hit: hit2
        };
        // Player 1 generates the proof for the move made by Player 2
        // Player 2 generates the proof for the move made by Player 1
        const {proof: _proofMovePlayer2, calldata: proofMovePlayer2} = await gameStateChannel.generateProof(moveInputPlayer2, moveWasmPath, moveZkeyPath);
        player2_moveStateHash = _proofMovePlayer2.publicSignals[6];
        // console.log(proofPlayer1);
        // proofMovePlayer1_converted & _proofMovePlayer1 - To be sent to Player 1
        const proofMovePlayer2_converted = {
          pA: proofMovePlayer2[0],
          pB: proofMovePlayer2[1],
          pC: proofMovePlayer2[2],
          pubSignals: proofMovePlayer2[3]
        };
        // PLayer 1 verify locally if proofs are right and signs the current game state and shares it with the Player2
        const resultOnChainProof_byPlayer1 = await gameStateChannel.verifyProof(moveVerification, _proofMovePlayer2);
        const resultOffChainProof_byPlayer1 = await moveVerifier.verifyProof(proofMovePlayer2_converted.pA, proofMovePlayer2_converted.pB, proofMovePlayer2_converted.pC, proofMovePlayer2_converted.pubSignals);

        // Check if local proof generations are okay. Else throw error from Player2's side.
        if(!resultOnChainProof_byPlayer1 || !resultOffChainProof_byPlayer1) {
          throw new Error("Move verification failed");
        } 

        gameStateChannel.updateLatestMoveHash(_proofMovePlayer2.publicSignals[6]);
        console.log("Latest move hash from Player 1 for Player 2 : ", _proofMovePlayer2.publicSignals[6]);

        // Generate move data for Player 1
        const moveTimestamp2 = Math.floor(Date.now() / 1000);
        let move_player2_byPlayer1 = {
          x: guessPlayer2[0],
          y: guessPlayer2[1],
          isHit: hit2,
          timestamp: moveTimestamp2
        };

        // Increment player2's hit count at Player 1's end
        await gameStateChannel.makeMove(move_player2_byPlayer1);

        const {signature: currentStateSignature_ofPlayer1, hash: currentStateHash_ofPlayer1} = await gameStateChannel.signGameState();
        console.log("Player 1 Signature: ", currentStateSignature_ofPlayer1);
        const latestGameState_fromPlayer1 = gameStateChannel.getGameState();
        const latestGameStateSC_fromPlayer1 = {
          stateHash: latestGameState_fromPlayer1.stateHash,
          nonce: latestGameState_fromPlayer1.nonce,
          currentTurn: latestGameState_fromPlayer1.currentTurn,
          moveCount: latestGameState_fromPlayer1.moveCount,
          player1ShipCommitment: latestGameState_fromPlayer1.player1ShipCommitment,
          player2ShipCommitment: latestGameState_fromPlayer1.player2ShipCommitment,
          player1Hits: latestGameState_fromPlayer1.player1Hits,
          player2Hits: latestGameState_fromPlayer1.player2Hits,
          gameEnded: latestGameState_fromPlayer1.gameEnded,
          winner: latestGameState_fromPlayer1.winner,
          timestamp: latestGameState_fromPlayer1.timestamp,
          lastMoveHash: latestGameState_fromPlayer1.lastMoveHash
        }
        console.log("derived game state Player 1", latestGameStateSC_fromPlayer1);
        
        // The move data to be sent to Player 1
        const movesData_player2_byPlayer1 = {
          move: move_player2_byPlayer1,
          signature: {
            player2: "",
            player1: currentStateSignature_ofPlayer1
          },
          gameState: latestGameStateSC_fromPlayer1,
          gameStateHash: currentStateHash_ofPlayer1,
          proofs: {proof: _proofMovePlayer2, calldata: proofMovePlayer2_converted}
        };

        let {isValid: resultGameStateSignaturePlayer3} = await gameStateChannel.verifyGameStateSignature(movesData_player2_byPlayer1.signature.player1, player1.address, movesData_player2_byPlayer1.gameState);
        console.log("Move state signature verification player 1 at Player 1's side - LOCAL VERIFICATION", resultGameStateSignaturePlayer3);

        if(!resultGameStateSignaturePlayer3) {
          throw new Error("Move state signature of Player 1 verification failed at Player 1's end! - LOCAL VERIFICATION");
        }

        // PLAYER 2 VERIFICATION

        // Player 2 verifies the proof generated by Player 1
        let resultMovePlayer2 = await moveVerifier.verifyProof(proofMovePlayer2_converted.pA, proofMovePlayer2_converted.pB, proofMovePlayer2_converted.pC, proofMovePlayer2_converted.pubSignals);
        console.log("Move verification proof player 2 at Player 1's side", resultMovePlayer2);

        let offchainVerificationPlayer2 = await gameStateChannel2.verifyProof(moveVerification, _proofMovePlayer2);
        console.log("Offchain move verification proof player 2 at Player 1's side", offchainVerificationPlayer2);

        let player2Signature_onPlayer1GameState  = await gameStateChannel2.signCustomGameState(movesData_player2_byPlayer1.gameState);
        movesData_player2_byPlayer1.signature.player2 = player2Signature_onPlayer1GameState;
        console.log("Player 2 Signature on Player 1's GameState: ", player2Signature_onPlayer1GameState)
        // PLayer 2 calls the makeMove function and updates the state accordingly!
        const isMyTurn_player2 = await gameStateChannel2.isMyTurn();
        let moveStateHash_player2 = "";
        if(isMyTurn_player2) {
          let {signature: moveStatehash, winnerFound: winnerFound2, winner: winner2} = await gameStateChannel2.makeMove(movesData_player2_byPlayer1.move);
          moveStateHash_player2 = moveStatehash;
          if(winnerFound2) {
              console.log("Game Over");
              winnerDeclared = true;
              winner = winner2;
          }
        }

        // PLAYER 2 SWITCH TURNS
        // If the move is valid, Player 2 acknowledges the move and shares the result back to Player 1
        if(resultMovePlayer2 && offchainVerificationPlayer2) {
          gameStateChannel2.switchTurn();
        } else {
          // Should go for dispute in real world scenario
          throw new Error("Move verification failed");
        }
        // Player 2 updates the moves using the data passed by Player 1
        await gameStateChannel2.updateMoves(movesData_player2_byPlayer1);

        let {isValid: resultGameStateSignaturePlayer4} = await gameStateChannel2.verifyGameStateSignature(movesData_player2_byPlayer1.signature.player1, player1.address, movesData_player2_byPlayer1.gameState);
        console.log("Move state signature verification player 1 at Player 2's side", resultGameStateSignaturePlayer4);

        if(!resultGameStateSignaturePlayer4) {
          throw new Error("Move state signature of Player 1 verification failed at Player 2's end!");
        }
        
        // PLayer 1 verifies the signature of GameState by Player 2
        let {isValid: resultGameStateSignaturePlayer5} = await gameStateChannel.verifyGameStateSignature(movesData_player2_byPlayer1.signature.player2, player2.address, movesData_player2_byPlayer1.gameState);
        console.log("Move state signature verification player 2 at Player 1's side", resultGameStateSignaturePlayer5);

        if(!resultGameStateSignaturePlayer5) {
          throw new Error("Move state signature of Player 2 verification failed at Player 1's end!");
        }
        // player 1 Switch turn to player2
        gameStateChannel.switchTurn();

        // Update the current move data for Player 2 at Player 1's side
        await gameStateChannel.updateMoves(movesData_player2_byPlayer1);

        // Checks if the winner is declared
        if(winnerDeclared) {
          await gameStateChannel.declareWinner(winner);
          await gameStateChannel2.declareWinner(winner);
          break;
        }

        if( i == 2 ) {
          break;
        }

      }

      const player2_gs = await gameStateChannel2.getGameState();
      const disputedGameState = player2_gs.movesData[player2_gs.movesData.length - 1];

      const disputedGameStateObj = {
        nonce: disputedGameState.gameState.nonce,
        currentTurn: disputedGameState.gameState.currentTurn,
        moveCount: disputedGameState.gameState.moveCount,
        player1ShipCommitment: disputedGameState.gameState.player1ShipCommitment,
        player2ShipCommitment: disputedGameState.gameState.player2ShipCommitment,
        player1Hits: disputedGameState.gameState.player1Hits,
        player2Hits: disputedGameState.gameState.player2Hits,
        gameEnded: disputedGameState.gameState.gameEnded,
        winner: disputedGameState.gameState.winner,
        timestamp: disputedGameState.gameState.timestamp,
        lastMoveHash: disputedGameState.gameState.lastMoveHash
      };
      const {hash: disputedStateHash, signature: disputedStateSignature} = await gameStateChannel2.signGameState();
      console.log("Object ", disputedGameState);
      console.log({
        channelId: Number(channelId),
        disputeType: gameStateChannel2.DisputeType.InvalidProof, // DisputeType.InvalidMove
        gameState: disputedGameStateObj,
        player1Signature: disputedGameState.signature.player1,
        player2Signature: disputedGameState.signature.player2,
        disputedStateHash
      })
      // Initiate dispute
      await expect(battleshipWaku.connect(player2).initiateDispute(
        Number(channelId),
        gameStateChannel2.DisputeType.InvalidProof,
        disputedGameStateObj,
        disputedGameState.signature.player1,
        disputedGameState.signature.player2,
        disputedStateHash
      )).to.emit(battleshipWaku, "DisputeInitiated").withArgs(
        Number(channelId), 1, player2.address, gameStateChannel2.DisputeType.InvalidProof
      );
        // Prepare all the moves made in the game by both the players using player 1's movesData
        // const player1_gs = await gameStateChannel.getGameState();

        // const player1_moveProofs = player1_gs.movesData.map((move: any) => move.proofs.calldata);

        // // Respond to dispute with counter-state
        // await expect(battleshipWaku.connect(player2).respondToDispute(
        //   1,
        //   player1_gs,
        //   disputedGameState.signature.player1,
        //   disputedGameState.signature.player2,
        //   player1_moveProofs
        // )).to.emit(battleshipWaku, "DisputeChallenged")
        //   .withArgs(1, player2.address, hre.ethers.keccak256(hre.ethers.AbiCoder.defaultAbiCoder().encode(
        //     ["tuple(bytes32,uint256,address,uint256,bytes32,bytes32,uint8,uint8,bool,address,uint256)"],
        //     [[
        //       player1_gs.stateHash,
        //       player1_gs.nonce,
        //       player1_gs.currentTurn,
        //       player1_gs.moveCount,
        //       player1_gs.player1ShipCommitment,
        //       player1_gs.player2ShipCommitment,
        //       player1_gs.player1Hits,
        //       player1_gs.player2Hits,
        //       player1_gs.gameEnded,
        //       player1_gs.winner,
        //       player1_gs.timestamp
        //     ]]
        //   )));

        // const updatedDispute = await battleshipWaku.getDispute(1);
        // expect(updatedDispute[4]).to.equal(1); // DisputeStatus.Challenged
    });
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