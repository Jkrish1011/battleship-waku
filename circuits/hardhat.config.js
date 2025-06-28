require("@openzeppelin/hardhat-upgrades");
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY_SEPOLIA, SEPOLIA_RPC_URL, ETHERSCAN_API_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.22",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
        details: {
          yul: true, // Enable Yul optimizer if applicable
        },
      },
      outputSelection: {
        "*": {
          "*": ["*"],
        },
      },
    },
  },
  circom: {
    inputBasePath: "./circuits",
    ptau: "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau",
    circuits: [
      {
        name: "ShipPlacement",
        circuit: "ShipPlacement.circom",
        input: "ShipPlacement",
        wasm: "ShipPlacement.wasm",
        zkey: "ShipPlacement.zkey",
      },
      {
        name: "MoveVerification", 
        circuit: "MoveVerification.circom",
        input: "MoveVerification",
        wasm: "MoveVerification.wasm",
        zkey: "MoveVerification.zkey",
      },
      {
        name: "WinVerification",
        circuit: "WinVerification.circom", 
        input: "WinVerification",
        wasm: "WinVerification.wasm",
        zkey: "WinVerification.zkey",
      }
    ],
  },
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [`0x${PRIVATE_KEY_SEPOLIA}`],
      gasPrice: "auto",
    },
    // // Alternative Sepolia RPC endpoints
    // sepolia_alchemy: {
    //   url: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    //   accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    // },
    // sepolia_infura: {
    //   url: `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
    //   accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    // },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    hardhat: {
      accounts: {
        count: 10,
      },
    },
  },
  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  mocha: {
    timeout: 200000, // 200 seconds for circuit compilation
  },
};