const { expect } = require("chai");
const hre = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const { BattleshipGameGenerator } = require("./helpers/gameGenerator");
const fs = require("fs");
const path = require("path");

describe("BattleshipWakuGame", function () {
  async function deployWordleAppFixture() {
    const gameGenerator = new BattleshipGameGenerator();
    await gameGenerator.initialize();
    const gameId = gameGenerator.randomBytesCrypto(32);
    const [owner, player1, player2] = await hre.ethers.getSigners();
    console.log(owner.address);
    
    const shipPlacementVerifier = await hre.ethers.deployContract("ShipPlacementVerifier");
    const moveVerifier = await hre.ethers.deployContract("MoveVerifier");
    const winVerifier = await hre.ethers.deployContract("WinVerifier");
    console.log("shipPlacementVerifier", shipPlacementVerifier.target);
    console.log("moveVerifier", moveVerifier.target);
    console.log("winVerifier", winVerifier.target);
    
    const battleshipWaku = await hre.ethers.deployContract("BattleshipWaku", [shipPlacementVerifier.target, moveVerifier.target, winVerifier.target]);
    console.log("BattleshipWaku", battleshipWaku.target);

    return { shipPlacementVerifier, moveVerifier, winVerifier, owner, battleshipWaku, player1, player2, gameGenerator, gameId };
  }

  it("Contracts deployed check", async function () {
    const { shipPlacementVerifier, moveVerifier, winVerifier, battleshipWaku } = await loadFixture(deployWordleAppFixture);

    // assert that the contract is deployed
    expect(shipPlacementVerifier.target).to.not.equal(0);
    expect(await shipPlacementVerifier.getAddress()).to.not.equal("0x0000000000000000000000000000000000000000");
    expect(moveVerifier.target).to.not.equal(0);
    expect(await moveVerifier.getAddress()).to.not.equal("0x0000000000000000000000000000000000000000");
    expect(winVerifier.target).to.not.equal(0);
    expect(await winVerifier.getAddress()).to.not.equal("0x0000000000000000000000000000000000000000");
    expect(battleshipWaku.target).to.not.equal(0);
    expect(await battleshipWaku.getAddress()).to.not.equal("0x0000000000000000000000000000000000000000");
  });

  it.only("Create game", async function () {
    const { battleshipWaku, player1, player2, gameGenerator, gameId, shipPlacementVerifier, moveVerifier, winVerifier } = await loadFixture(deployWordleAppFixture);
    console.log("gameId", gameId);
    const player1Address = player1.address;
    const player2Address = player2.address;
    console.log("player1Address", player1Address);
    console.log("player2Address", player2Address);
    let shipPlacementPositionsPlayer1 = null, shipPlacementPositionsPlayer2 = null, shipPositions1 = null, shipPositions2 = null;
    while (true) {
      shipPositions1 = gameGenerator.generateRandomShipPositions();
      shipPlacementPositionsPlayer1 = await gameGenerator.generateShipPlacementPositions(shipPositions1);
      const isValid = gameGenerator.validateInput(shipPlacementPositionsPlayer1.ships, shipPlacementPositionsPlayer1.board_state)
      console.log("isValid", isValid);
      if (isValid) {
        break;
      }
    }
    console.log("shipPlacementPositionsPlayer1: ", shipPlacementPositionsPlayer1);
    while (true) {
      shipPositions2 = gameGenerator.generateRandomShipPositions();
      shipPlacementPositionsPlayer2 = await gameGenerator.generateShipPlacementPositions(shipPositions2);
      if (gameGenerator.validateInput(shipPlacementPositionsPlayer2.ships, shipPlacementPositionsPlayer2.board_state)) {
        break;
      }
    }
    console.log("shipPlacementPositionsPlayer2:", shipPlacementPositionsPlayer2);

    const wasmPath = path.join(__dirname, "..", "build", "ship_placement", "ship_placement_js", "ship_placement.wasm");
    const zkeyPath = path.join(__dirname, "..", "keys", "ship_placement_final.zkey");
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`WASM file not found at: ${wasmPath}`);
    }
    
    if (!fs.existsSync(zkeyPath)) {
        throw new Error(`zkey file not found at: ${zkeyPath}`);
    }
    console.log("wasmPath", wasmPath);
    console.log("zkeyPath", zkeyPath);
    // const wasmBuffer = fs.readFileSync(wasmPath);
    // const zkeyBuffer = fs.readFileSync(zkeyPath);
    // console.log("WASM buffer size:", wasmBuffer.length);
    // console.log("zkey buffer size:", zkeyBuffer.length);
    console.log("--");

    const proofPlayer1 = await gameGenerator.generateProof(shipPlacementPositionsPlayer1, wasmPath, zkeyPath);
    // console.log(proofPlayer1);
    const proofPlayer1_converted = {
      pA: proofPlayer1[0],
      pB: proofPlayer1[1],
      pC: proofPlayer1[2],
      pubSignals: proofPlayer1[3]
    };
    
    let result = await shipPlacementVerifier.verifyProof(proofPlayer1_converted.pA, proofPlayer1_converted.pB, proofPlayer1_converted.pC, proofPlayer1_converted.pubSignals);
    console.log("result", result);

    const proofPlayer2 = await gameGenerator.generateProof(shipPlacementPositionsPlayer2, wasmPath, zkeyPath);
    const proofPlayer2_converted = {
      pA: proofPlayer2[0],
      pB: proofPlayer2[1],
      pC: proofPlayer2[2],
      pubSignals: proofPlayer2[3]
    };
    let result2 = await shipPlacementVerifier.verifyProof(proofPlayer2_converted.pA, proofPlayer2_converted.pB, proofPlayer2_converted.pC, proofPlayer2_converted.pubSignals);
    console.log("result2", result2);

    const shipPlacementProofPlayer1 = await battleshipWaku.createGame(player1Address, player2Address, proofPlayer1_converted, proofPlayer2_converted, gameId);
    console.log("createGame txHash: ", shipPlacementProofPlayer1.hash);

    /*
      Player 1 will make a move.
      For the move, we need to get the boardstate and commitments of the player2's game board.

      When Player 1 is making a move, his move is passed to player 2 in prod and player 2 will be executing this at his/her end.
      and vise-versa for player 2.
    */
    
    const moveWasmPath = path.join(__dirname, "..", "build", "move_verification", "move_verification_js", "move_verification.wasm");
    const moveZkeyPath = path.join(__dirname, "..", "keys", "move_verification_final.zkey");
    if (!fs.existsSync(moveWasmPath)) {
      throw new Error(`WASM file not found at: ${moveWasmPath}`);
    }
    
    if (!fs.existsSync(moveZkeyPath)) {
        throw new Error(`zkey file not found at: ${moveZkeyPath}`);
    }
    console.log("moveWasmPath", moveWasmPath);
    console.log("zkemoveZkeyPathyPath", moveZkeyPath);

    const player1ShipPositions = gameGenerator.calculateShipPositions(shipPositions1);
    const player2ShipPositions = gameGenerator.calculateShipPositions(shipPositions2);

    for (let i = 0; i < 12; i++) {
      // Player 1 makes a move
      console.log("Player 1 makes a move", i);
      const guessPlayer1 = player2ShipPositions[i];
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
      const proofMovePlayer1 = await gameGenerator.generateProof(moveInputPlayer1, moveWasmPath, moveZkeyPath);
      // console.log(proofPlayer1);
      const proofMovePlayer1_converted = {
        pA: proofMovePlayer1[0],
        pB: proofMovePlayer1[1],
        pC: proofMovePlayer1[2],
        pubSignals: proofMovePlayer1[3]
      };
    
      let resultMovePlayer1 = await moveVerifier.verifyProof(proofMovePlayer1_converted.pA, proofMovePlayer1_converted.pB, proofMovePlayer1_converted.pC, proofMovePlayer1_converted.pubSignals);
      

      // Connect the contract to player1
      const battleshipWakuWithPlayer1 = battleshipWaku.connect(player1);
      const moveTxHash = await battleshipWakuWithPlayer1.makeMove(gameId, proofMovePlayer1_converted);
      console.log("makeMove txHash: ", moveTxHash);

      // Player 2 makes a move
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
        const proofMovePlayer2 = await gameGenerator.generateProof(moveInputPlayer2, moveWasmPath, moveZkeyPath);
        // console.log(proofPlayer1);
        const proofMovePlayer2_converted = {
          pA: proofMovePlayer2[0],
          pB: proofMovePlayer2[1],
          pC: proofMovePlayer2[2],
          pubSignals: proofMovePlayer2[3]
        };
      
        let resultMovePlayer2 = await moveVerifier.verifyProof(proofMovePlayer2_converted.pA, proofMovePlayer2_converted.pB, proofMovePlayer2_converted.pC, proofMovePlayer2_converted.pubSignals);

        // Connect the contract to player1
        const battleshipWakuWithPlayer2 = battleshipWaku.connect(player2);
        const moveTxHash2 = await battleshipWakuWithPlayer2.makeMove(gameId, proofMovePlayer2_converted);
        console.log("makeMove txHash: ", moveTxHash2);
    }

    // get game state
    const gameState = await battleshipWaku.getGame(gameId);
    console.log("gameState", ...gameState);

    const winWasmPath = path.join(__dirname, "..", "build", "win_verification", "win_verification_js", "win_verification.wasm");
    const winZkeyPath = path.join(__dirname, "..", "keys", "win_verification_final.zkey");
    if (!fs.existsSync(winWasmPath)) {
      throw new Error(`WASM file not found at: ${winWasmPath}`);
    }
    
    if (!fs.existsSync(winZkeyPath)) {
        throw new Error(`zkey file not found at: ${winZkeyPath}`);
    }
    console.log("winWasmPath", winWasmPath);
    console.log("winZkeyPath", winZkeyPath);

    // Win verification for Player 1
    const winInputPlayer1 = {
      salt: shipPlacementPositionsPlayer2.salt,
      commitment: shipPlacementPositionsPlayer2.commitment,
      merkle_root: shipPlacementPositionsPlayer2.merkle_root,
      board_state: shipPlacementPositionsPlayer2.board_state,
      hit_count: 12,
      hits: player2ShipPositions,
    }

    const proofWinPlayer1 = await gameGenerator.generateProof(winInputPlayer1, winWasmPath, winZkeyPath);
    const proofWinPlayer1_converted = {
      pA: proofWinPlayer1[0],
      pB: proofWinPlayer1[1],
      pC: proofWinPlayer1[2],
      pubSignals: proofWinPlayer1[3]
    }

    let resultWinPlayer1 = await winVerifier.verifyProof(proofWinPlayer1_converted.pA, proofWinPlayer1_converted.pB, proofWinPlayer1_converted.pC, proofWinPlayer1_converted.pubSignals);
    console.log("resultWinPlayer1", resultWinPlayer1);

    // Connect the contract to player1
    const battleshipWakuWithPlayer1 = battleshipWaku.connect(player1);
    const winTxHash = await battleshipWakuWithPlayer1.winVerification(gameId, proofWinPlayer1_converted);
    console.log("winVerification txHash: ", winTxHash);
  });


  it.only("Win verification Failure", async function () {
    const { battleshipWaku, player1, player2, gameGenerator, gameId, shipPlacementVerifier, moveVerifier, winVerifier } = await loadFixture(deployWordleAppFixture);
    console.log("gameId", gameId);
    const player1Address = player1.address;
    const player2Address = player2.address;
    console.log("player1Address", player1Address);
    console.log("player2Address", player2Address);
    let shipPlacementPositionsPlayer1 = null, shipPlacementPositionsPlayer2 = null, shipPositions1 = null, shipPositions2 = null;
    while (true) {
      shipPositions1 = gameGenerator.generateRandomShipPositions();
      shipPlacementPositionsPlayer1 = await gameGenerator.generateShipPlacementPositions(shipPositions1);
      const isValid = gameGenerator.validateInput(shipPlacementPositionsPlayer1.ships, shipPlacementPositionsPlayer1.board_state)
      console.log("isValid", isValid);
      if (isValid) {
        break;
      }
    }
    console.log("shipPlacementPositionsPlayer1: ", shipPlacementPositionsPlayer1);
    while (true) {
      shipPositions2 = gameGenerator.generateRandomShipPositions();
      shipPlacementPositionsPlayer2 = await gameGenerator.generateShipPlacementPositions(shipPositions2);
      if (gameGenerator.validateInput(shipPlacementPositionsPlayer2.ships, shipPlacementPositionsPlayer2.board_state)) {
        break;
      }
    }
    console.log("shipPlacementPositionsPlayer2:", shipPlacementPositionsPlayer2);

    const player1ShipPositions = gameGenerator.calculateShipPositions(shipPositions1);
    const player2ShipPositions = gameGenerator.calculateShipPositions(shipPositions2);

    const wasmPath = path.join(__dirname, "..", "build", "ship_placement", "ship_placement_js", "ship_placement.wasm");
    const zkeyPath = path.join(__dirname, "..", "keys", "ship_placement_final.zkey");
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`WASM file not found at: ${wasmPath}`);
    }
    
    if (!fs.existsSync(zkeyPath)) {
        throw new Error(`zkey file not found at: ${zkeyPath}`);
    }
    console.log("wasmPath", wasmPath);
    console.log("zkeyPath", zkeyPath);
    // const wasmBuffer = fs.readFileSync(wasmPath);
    // const zkeyBuffer = fs.readFileSync(zkeyPath);
    // console.log("WASM buffer size:", wasmBuffer.length);
    // console.log("zkey buffer size:", zkeyBuffer.length);
    console.log("--");

    const proofPlayer1 = await gameGenerator.generateProof(shipPlacementPositionsPlayer1, wasmPath, zkeyPath);
    // console.log(proofPlayer1);
    const proofPlayer1_converted = {
      pA: proofPlayer1[0],
      pB: proofPlayer1[1],
      pC: proofPlayer1[2],
      pubSignals: proofPlayer1[3]
    };
    
    let result = await shipPlacementVerifier.verifyProof(proofPlayer1_converted.pA, proofPlayer1_converted.pB, proofPlayer1_converted.pC, proofPlayer1_converted.pubSignals);
    console.log("result", result);

    const proofPlayer2 = await gameGenerator.generateProof(shipPlacementPositionsPlayer2, wasmPath, zkeyPath);
    const proofPlayer2_converted = {
      pA: proofPlayer2[0],
      pB: proofPlayer2[1],
      pC: proofPlayer2[2],
      pubSignals: proofPlayer2[3]
    };
    let result2 = await shipPlacementVerifier.verifyProof(proofPlayer2_converted.pA, proofPlayer2_converted.pB, proofPlayer2_converted.pC, proofPlayer2_converted.pubSignals);
    console.log("result2", result2);

    const shipPlacementProofPlayer1 = await battleshipWaku.createGame(player1Address, player2Address, proofPlayer1_converted, proofPlayer2_converted, gameId);
    console.log("createGame txHash: ", shipPlacementProofPlayer1.hash);

    const winWasmPath = path.join(__dirname, "..", "build", "win_verification", "win_verification_js", "win_verification.wasm");
    const winZkeyPath = path.join(__dirname, "..", "keys", "win_verification_final.zkey");
    if (!fs.existsSync(winWasmPath)) {
      throw new Error(`WASM file not found at: ${winWasmPath}`);
    }
    
    if (!fs.existsSync(winZkeyPath)) {
        throw new Error(`zkey file not found at: ${winZkeyPath}`);
    }
    console.log("winWasmPath", winWasmPath);
    console.log("winZkeyPath", winZkeyPath);

    // Win verification for Player 1
    const winInputPlayer1 = {
      salt: shipPlacementPositionsPlayer2.salt,
      commitment: shipPlacementPositionsPlayer2.commitment,
      merkle_root: shipPlacementPositionsPlayer2.merkle_root,
      board_state: shipPlacementPositionsPlayer2.board_state,
      hit_count: 12,
      hits: player2ShipPositions,
    }

    const proofWinPlayer1 = await gameGenerator.generateProof(winInputPlayer1, winWasmPath, winZkeyPath);
    const proofWinPlayer1_converted = {
      pA: proofWinPlayer1[0],
      pB: proofWinPlayer1[1],
      pC: proofWinPlayer1[2],
      pubSignals: proofWinPlayer1[3]
    }

    let resultWinPlayer1 = await winVerifier.verifyProof(proofWinPlayer1_converted.pA, proofWinPlayer1_converted.pB, proofWinPlayer1_converted.pC, proofWinPlayer1_converted.pubSignals);
    console.log("resultWinPlayer1", resultWinPlayer1);

    // Connect the contract to player1
    const battleshipWakuWithPlayer1 = battleshipWaku.connect(player1);
    await expect(battleshipWakuWithPlayer1.winVerification(gameId, proofWinPlayer1_converted)).to.be.revertedWith("Game is not over");
  
  });

});