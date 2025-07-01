const { ethers, upgrades } = require("hardhat");
require('dotenv').config();
const battleshipWakuAbi = require("./../artifacts/contracts/BattleshipWaku.sol/BattleshipWaku.json");

const getContract = async (CONTRACT_ADDRESS, CONTRACT_ABI, RPC_URL) => {
    try {
      
      // Validate contract address format
      if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
        throw new Error(`Invalid contract address: ${CONTRACT_ADDRESS}`);
      }

      // Connect to the user's MetaMask wallet
      const provider = new ethers.JsonRpcProvider(RPC_URL);
    //   const signer = await provider.getSigner();
      
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    } catch (error) {
      console.error('Contract initialization failed:', error);
      throw error;
    }
  };

async function main() {
    try {
        const [deployer] = await ethers.getSigners();
        console.log({deployer});
        const contract = await getContract(process.env.ETHEREUM_SEPOLIA_CONTRACT_ADDRESS, battleshipWakuAbi.abi, process.env.SEPOLIA_RPC_URL);
        const games = await contract.getAllGames.staticCall({
            gasLimit: 500000
          });
          let parsedGames = [];
          // If games is an array of arrays (each game is an array of values)
          if (Array.isArray(games) && games.length > 0) {
            parsedGames = games.map((game, index) => {
                if (Array.isArray(game)) {
                    return {
                        gameId: game[0],
                        player1: game[1],
                        player2: game[2],
                        isActive: game[3],
                        playerTurn: game[4],
                        player1_board_commitment: game[5],
                        player1_merkle_root: game[6],
                        player2_board_commitment: game[7],
                        player2_merkle_root: game[8],
                        wakuRoomId: game[9],
                        
                    };
                }
                return game;
            });
            console.log("Parsed games:", parsedGames);
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

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });