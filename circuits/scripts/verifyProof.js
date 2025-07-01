const { ethers, upgrades } = require("ethers");
require('dotenv').config();
const shipPlacementVerifierAbi = require("./../artifacts/contracts/ship_placement.sol/ShipPlacementVerifier.json");

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
        
        const contract = await getContract(process.env.ETHEREUM_SEPOLIA_SHIP_PLACEMENT_CONTRACT_ADDRESS, shipPlacementVerifierAbi.abi, process.env.SEPOLIA_RPC_URL);
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
        console.log('Verifying proof with:');
        console.log('Proof:', proofPlayer1_converted);
        
        // Since verifyProof is a view function, we call it directly without waiting for a transaction
        const isValid = await contract.verifyProof(proofPlayer1_converted[0], proofPlayer1_converted[1], proofPlayer1_converted[2], proofPlayer1_converted[3]);
        
        console.log('Proof verification result:', isValid);
        
        if (isValid) {
            console.log('✅ Proof is valid!');
        } else {
            console.log('❌ Proof is invalid!');
        }
    } catch (error) {
        console.error("Verification failed:", error);
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