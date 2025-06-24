const { expect } = require("chai");
const hre = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const { BattleshipGameGenerator } = require("./helpers/gameGenerator");

describe("BattleshipWakuGame", function () {
  async function deployWordleAppFixture() {
    const gameGenerator = new BattleshipGameGenerator();
    await gameGenerator.initialize();
    
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

    return { shipPlacementVerifier, moveVerifier, winVerifier, owner, battleshipWaku, player1, player2, gameGenerator };
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

  it("Create game", async function () {
    const { battleshipWaku, player1, player2, gameGenerator } = await loadFixture(deployWordleAppFixture);
    const gameId = 1;
    const player1Address = player1.address;
    const player2Address = player2.address;
    console.log("player1Address", player1Address);
    console.log("player2Address", player2Address);
    const shipPlacementPositionsPlayer1 = await gameGenerator.generateShipPlacementPositions();
    console.log("shipPlacementPositionsPlayer1: ", shipPlacementPositionsPlayer1);
    const shipPlacementPositionsPlayer2 = await gameGenerator.generateShipPlacementPositions();
    console.log("shipPlacementPositionsPlayer2:", shipPlacementPositionsPlayer2);
    // const shipPlacementProofPlayer1 = await battleshipWaku.createGame(gameId, player1Address, player2Address, shipPlacementPositions);
    // console.log("shipPlacementProofPlayer1", shipPlacementProofPlayer1);
  });

});