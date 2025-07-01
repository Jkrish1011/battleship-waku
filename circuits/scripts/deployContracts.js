const { ethers, upgrades } = require("hardhat");
require('dotenv').config();

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    try {
        // Deploy verifier contracts first
        console.log("\n1. Deploying verifier contracts...");
        // Deploy all three verifier contracts
        const verifierArtifacts = ["ShipPlacementVerifier", "MoveVerifier", "WinVerifier"];
        const verifierAddresses = [];
        
        for (const artifact of verifierArtifacts) {
            const Verifier = await hre.ethers.getContractFactory(artifact);
            const verifier = await Verifier.deploy();
            await verifier.waitForDeployment();
            const address = await verifier.getAddress();
            verifierAddresses.push(address);
            console.log(`${artifact} deployed to:`, address);
        }

        console.log("Deploying BattleshipWaku...");
        const BattleshipWaku = await ethers.getContractFactory("BattleshipWaku");
        const battleship = await upgrades.deployProxy(BattleshipWaku, verifierAddresses);
        await battleship.waitForDeployment();
        
        console.log("BattleshipWaku deployed to:", await battleship.getAddress());

        // Verify the proxy deployment
        console.log("\n3. Verifying proxy deployment...");
        try {
            const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(battleship.target);
            console.log("Implementation deployed to:", implementationAddress);
            
            const adminAddress = await hre.upgrades.erc1967.getAdminAddress(battleship.target);
            console.log("Admin address:", adminAddress);
            
            // Test if the contract is properly initialized
            const owner = await battleship.owner();
            console.log("Contract owner:", owner);
            
            console.log("\n\n Deployment successful!");
        } catch (error) {
            console.error(" Error verifying proxy deployment:", error.message);
            throw error;
        }

    } catch (error) {
        console.error("Deployment failed:", error);
        console.error("Error details:", error.message);
        if (error.reason) {
            console.error("Reason:", error.reason);
        }
        throw error;
    }
}
/*
Deploying contracts with the account: 0x2B27326d412efB3D03B142f4DEA2Dd3E53Dd7bB2
Account balance: 239190769535213379

1. Deploying verifier contracts...
ShipPlacementVerifier deployed to: 0x2E338F1F4e012D65b20cD8A6EF2cd443EAA6303B
MoveVerifier deployed to: 0x686aFb63d1760A984675Df0B285bc6b0DEDC8F9A
WinVerifier deployed to: 0xb0dCfe981BADfc1eEaC7b0Bcb51556c4c02E9D88
Deploying BattleshipWaku...
BattleshipWaku deployed to: 0xA4605f06ccbBf8Fe1204BCFf36DE5212Cb0855a1

3. Verifying proxy deployment...
Implementation deployed to: 0x53E8360305537c3A73E27645778B588CE1e80377
Admin address: 0x0000000000000000000000000000000000000000
Contract owner: 0x2B27326d412efB3D03B142f4DEA2Dd3E53Dd7bB2


 Deployment successful!
*/

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });