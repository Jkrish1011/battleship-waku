// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("hardhat-circom");

module.exports = {
  solidity: "0.8.19",
  circom: {
    inputBasePath: "./circuits",
    outputBasePath: "./circuits/artifacts",
    ptau: "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau",
    circuits: [
      {
        name: "ship_placement",
        protocol: "groth16",
        circuit: "ship_placement.circom",
        wasm: "ship_placement.wasm",
        zkey: "ship_placement.zkey"
      }
    ],
  },
  paths: {
    sources: "./circuits",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    circuits: "./circuits",
    circuitArtifacts: "./circuits/artifacts",
    output: "./target"
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true
    }
  }
};