const { ethers, upgrades } = require("hardhat");
require('dotenv').config();

const { ETHEREUM_SEPOLIA_CONTRACT_ADDRESS } = process.env;

async function main() {
    console.log("Upgrading proxy at:", ETHEREUM_SEPOLIA_CONTRACT_ADDRESS);

    // Deploy the new implementation contract
    const BattleshipWaku = await ethers.getContractFactory("BattleshipWaku");
    const upgraded = await upgrades.upgradeProxy(ETHEREUM_SEPOLIA_CONTRACT_ADDRESS, BattleshipWaku);

    console.log("Proxy upgraded to V2 at:", upgraded);

    // Get the new implementation address
    const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(ETHEREUM_SEPOLIA_CONTRACT_ADDRESS);
    console.log("New implementation deployed to:", newImplementationAddress);

    // Get the admin address
    const adminAddress = await upgrades.erc1967.getAdminAddress(ETHEREUM_SEPOLIA_CONTRACT_ADDRESS);
    console.log("Admin address:", adminAddress);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });