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
Account balance: 299913004146469892

1. Deploying verifier contracts...
shipPlacementVerifier deployed to: 0x918438210985C9A5342E79F5eaaA9a19F47311df
moveVerifier deployed to: 0xB9A662850efd18D6ffb6896cec1CbeA7c096c68e
winVerifier deployed to: 0x5C50C69E03Db3aF87a4E30ceE3736b0D970bA41c

2. Deploying BattleshipWaku as proxy...
Deploying proxy with verifier addresses:
- ShipPlacementVerifier: 0x918438210985C9A5342E79F5eaaA9a19F47311df
- MoveVerifier: 0xB9A662850efd18D6ffb6896cec1CbeA7c096c68e
- WinVerifier: 0x5C50C69E03Db3aF87a4E30ceE3736b0D970bA41c
BattleshipWaku proxy deployed to: 0x16811dA60a5c16FAa40039a9bDa3B2e0B142e0d8

3. Verifying proxy deployment...
Implementation deployed to: 0xA92ccFdBFb53B32e708445130f3F7836790cD5CD
Admin address: 0x0000000000000000000000000000000000000000
Contract owner: 0x2B27326d412efB3D03B142f4DEA2Dd3E53Dd7bB2

✅ Deployment successful!
*/

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });