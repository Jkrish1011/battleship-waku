require("@nomicfoundation/hardhat-toolbox");
require("hardhat-circom");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.19",
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
    hardhat: {
      accounts: {
        count: 10,
      },
    },
  },
  mocha: {
    timeout: 200000, // 200 seconds for circuit compilation
  },
};