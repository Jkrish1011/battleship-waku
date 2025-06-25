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
    const { battleshipWaku, player1, player2, gameGenerator, gameId, shipPlacementVerifier } = await loadFixture(deployWordleAppFixture);
    console.log("gameId", gameId);
    const player1Address = player1.address;
    const player2Address = player2.address;
    console.log("player1Address", player1Address);
    console.log("player2Address", player2Address);
    let shipPlacementPositionsPlayer1 = null, shipPlacementPositionsPlayer2 = null;
    while (true) {
      shipPlacementPositionsPlayer1 = await gameGenerator.generateShipPlacementPositions();
      if (gameGenerator.validateInput(shipPlacementPositionsPlayer1.ships, shipPlacementPositionsPlayer1.board_state)) {
        break;
      }
    }
    console.log("shipPlacementPositionsPlayer1: ", shipPlacementPositionsPlayer1);
    while (true) {
      shipPlacementPositionsPlayer2 = await gameGenerator.generateShipPlacementPositions();
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
    const wasmBuffer = fs.readFileSync(wasmPath);
    const zkeyBuffer = fs.readFileSync(zkeyPath);
    console.log("WASM buffer size:", wasmBuffer.length);
    console.log("zkey buffer size:", zkeyBuffer.length);
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
    console.log("shipPlacementProofPlayer1", shipPlacementProofPlayer1);
    
  });

});