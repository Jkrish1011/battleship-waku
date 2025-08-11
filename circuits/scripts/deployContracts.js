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

        console.log("Deploying BattleshipStateChannel...");
        const BattleshipStateChannel = await ethers.getContractFactory("BattleshipStateChannel");
        const battleship = await upgrades.deployProxy(BattleshipStateChannel, verifierAddresses);
        await battleship.waitForDeployment();
        
        console.log("BattleshipStateChannel deployed to:", await battleship.getAddress());

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
Compiled 5 Solidity files successfully (evm target: paris).
[dotenv@17.0.0] injecting env (7) from .env – 🔐 encrypt with dotenvx: https://dotenvx.com
[dotenv@17.0.0] injecting env (7) from .env – 🔐 encrypt with dotenvx: https://dotenvx.com
Deploying contracts with the account: 0x2B27326d412efB3D03B142f4DEA2Dd3E53Dd7bB2
Account balance: 1051479890404784301

1. Deploying verifier contracts...
ShipPlacementVerifier deployed to: 0xA325bE8A890d014Ab2b40C983521feA5CF11d1A8
MoveVerifier deployed to: 0xA6c8FE667a67C766D4D8e50DEC753FEe21172c10
WinVerifier deployed to: 0xce3613a901a03132B530e1f937d9Fe9A2035B399
Deploying BattleshipStateChannel...
BattleshipStateChannel deployed to: 0x7f6c6E02511a4b29bB83ac3163844a75d4EbB07e

3. Verifying proxy deployment...
Implementation deployed to: 0x3cF205e48938b11f8997Ad10aaF487544DFB92d6
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