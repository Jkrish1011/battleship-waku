const { ethers, upgrades } = require("hardhat");
require('dotenv').config();
const battleshipWakuAbi = require("./../artifacts/contracts/BattleshipWaku.sol/BattleshipWaku.json");

const getContract = async (CONTRACT_ADDRESS, CONTRACT_ABI, RPC_URL) => {
    try {
      
      // Validate contract address format
      if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
        throw new Error(`Invalid contract address: ${CONTRACT_ADDRESS}`);
      }

      // Connect to the provider
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    } catch (error) {
      console.error('Contract initialization failed:', error);
      throw error;
    }
  };

async function main() {
    try {
        const contract = await getContract(process.env.ETHEREUM_SEPOLIA_CONTRACT_ADDRESS, battleshipWakuAbi.abi, process.env.SEPOLIA_RPC_URL);
        
        const gameId = "16955867186917062529089195948227404834675952757667760597763441106929560619616";
        
        console.log('Getting game with ID:', gameId);
        
        const game = await contract.getGameById(gameId);
        console.log('Game data:', game);
        
        // Also get the game count
        const gameCount = await contract.gameCount();
        console.log('Total game count:', gameCount.toString());
        
        // Get all game IDs
        const gameIds = await contract.gameIds(0);
        console.log('First game ID in array:', gameIds.toString());
        
    } catch (error) {
        console.error("Failed:", error);
        console.error("Error details:", error.message);
        if (error.reason) {
            console.error("Reason:", error.reason);
        }
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 