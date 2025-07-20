const { ethers, upgrades } = require("ethers");
require('dotenv').config();
const battleshipWakuAbi = require("./../artifacts/contracts/BattleshipWaku.sol/BattleshipWaku.json");
const { BattleshipGameGenerator } = require("../test/helpers/GameGenerator");

const getContract = async (CONTRACT_ADDRESS, CONTRACT_ABI, RPC_URL) => {
    try {
      
      // Validate contract address format
      if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
        throw new Error(`Invalid contract address: ${CONTRACT_ADDRESS}`);
      }

      // Connect to the provider
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      
      // Create a signer using private key from environment
      if (!process.env.PRIVATE_KEY_SEPOLIA) {
        throw new Error('PRIVATE_KEY_SEPOLIA environment variable is required');
      }
      const signer = new ethers.Wallet(process.env.PRIVATE_KEY_SEPOLIA, provider);
      
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    } catch (error) {
      console.error('Contract initialization failed:', error);
      throw error;
    }
  };

async function main() {
    try {
        
        const contract = await getContract(process.env.ETHEREUM_SEPOLIA_CONTRACT_ADDRESS, battleshipWakuAbi.abi, process.env.SEPOLIA_RPC_URL);
        const gameGenerator = new BattleshipGameGenerator();
        const gameId = gameGenerator.randomBytesCrypto(32);
        const roomId = Math.floor(Math.random() * 900) + 100;
        const proofPlayer1_converted = [
            [
                "0x2a51d9782cff44eff96873a40ba1f8c14bcc4228c8e6474d4800c4a73d91da94",
                "0x22c9c29eea1ce08751e236a7e528f03b3f79e5fbea9c95b8af2364ec5bfcfc69"
            ],
            [
                [
                    "0x2b1eca736e992fb547ac629d3792b8399f9f16083d0f5af6221c1522a3c98e21",
                    "0x17c5d771bfd944a9aa7c78db84329579b1fd599731fa526d0e3c39a7af8b6c4e"
                ],
                [
                    "0x18f1e07cd4f224960518454b17289f9264898cd6f73cee00d4b770cea195c47f",
                    "0x131d4b88eeb317b7aa71e7cd7ad819ec1146e86ad673e0ac678580ff0275d49a"
                ]
            ],
            [
                "0x29bbd16abd7377710e8cf68fae461b4768a660f309ab7b13c3d83737913cbc5e",
                "0x02f2e5566523edbf58e200607e1ea10e99fe038ac7d721ea6b6ac89f603181b2"
            ],
            [
                "0x19b2cc1fd6e6b2c60eb45e10c0a113a0d84418d97677dab43bdeda82720daeb6",
                "0x2b210196832104d3246a65018c291b1ed4a5a99c1fbf3dfa62e742e50f9ab189"
            ]
        ];
        console.log(battleshipWakuAbi);
        console.log('Creating game with:');
        const userAddress = `0xA014Ca018A22f96D00B920410834Bb1504B183E1`;
        console.log('Player address:', userAddress);
        console.log('Game ID:', gameId);
        console.log('Proof:', proofPlayer1_converted);
        console.log({roomId});
        
        const tx = await contract.createGame(userAddress.toString(), proofPlayer1_converted, gameId, roomId, {
            gasLimit: 5000000 
        });
        await tx.wait();
        console.log(tx);
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