const { expect } = require("chai");
const hre = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ShipPlacementVerifier", function () {
  async function deployWordleAppFixture() {
    const verifier = await hre.ethers.deployContract("ShipPlacementVerifier");
    console.log("verifier", verifier.target);
    const [owner] = await hre.ethers.getSigners();
    

    return { shipPlacement};
  }

//   it("Should set the right verifier", async function () {
//     const { wordleApp, verifier } = await loadFixture(deployWordleAppFixture);

//     // assert that the value is correct
//     expect(await wordleApp.verifier()).to.equal(verifier.target);
//   });

//   it("Start Game", async function () {
//     const { wordleApp } = await loadFixture(deployWordleAppFixture);

//     const [owner] = await hre.ethers.getSigners();

//     const sessionId = BigInt(7018558081055087327022903219186038509231319607451137873687964136067378122800);
//     const commitment = "0x2197362b1dddc4c94d89834ba3941074fda8b4d8eb6786959b4247968c4510ee";

//     await wordleApp.startSession(sessionId.toString(), owner.address, commitment);
// HonkVerifier.sol - 0xF3d87Ff705E75D402DEf6496D290a5727BB88017
// WordleApp.sol - 0xc69f8bA784c60F2bF81714e80A9ca5F09385a7b2
//   });

//   it("Verify Guess", async function () {
//     const { wordleApp } = await loadFixture(deployWordleAppFixture);

//     const [owner] = await hre.ethers.getSigners();
//     const targetWord = pickRandomWord();
//     const sessionId = uint8ArrayToBigIntBE(randomBytesCrypto(64)) % Fr.MODULUS;
//     const salt = uint8ArrayToBigIntBE(randomBytesCrypto(64)) % Fr.MODULUS;
//     console.log("targetWord", targetWord);
//     const bb = await initBarretenberg();
//     const { commitment, wordInputs } = await computePedersenCommmitment(targetWord, sessionId, salt, bb);

//     const userInput = "ABCDEF";
//     const userInputConverted = [...userInput].map(char => {
//         return getAlphabeticIndex(char);
//     }).map(alphabet => BigInt(alphabet));

//     const targetWordConverted = wordInputs;

//     const feedback = checkGuess(userInput, targetWord);
//     const feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.startSession(sessionId.toString(), owner.address, commitment);

//     const noirInputs = {
//         targetWord: targetWordConverted,
//         salt: BigInt(salt),
//         session_id: BigInt(sessionId),
//         pedersen_hash: BigInt(commitment), 
//         feedback: feedbackConverted, 
//         userInput: userInputConverted
//     };
  
//     const noirInputsConverted = prepareNoirInputs(noirInputs);
//     console.log({noirInputsConverted});
//     const backend = new UltraHonkBackend(circuit.bytecode);
//     const noir = new Noir(circuit);
//     const { witness } = await noir.execute(noirInputsConverted);
//     const {proof, publicInputs} = await backend.generateProof(witness, {keccak: true});
//     const verified = await backend.verifyProof({proof, publicInputs}, {keccak: true});
//     console.log({verified});

//     const EXPECTED_BYTES = 440 * 32; // 14,080 bytes
//     // console.log("proof", proof);
//     // console.log("commitment", commitment);
//     let result = await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);
//     // console.log({result});
//   });

//   it("Reveal Word Correct Guess", async function () {
//     const { wordleApp } = await loadFixture(deployWordleAppFixture);

//     const [owner] = await hre.ethers.getSigners();
//     const targetWord = pickRandomWord();
//     const sessionId = uint8ArrayToBigIntBE(randomBytesCrypto(64)) % Fr.MODULUS;
//     const salt = uint8ArrayToBigIntBE(randomBytesCrypto(64)) % Fr.MODULUS;
//     console.log("targetWord", targetWord);
//     const bb = await initBarretenberg();
//     const { commitment, wordInputs } = await computePedersenCommmitment(targetWord, sessionId, salt, bb);

//     let userInput = "ABCDEF";
//     const userInputConverted = [...userInput].map(char => {
//         return getAlphabeticIndex(char);
//     }).map(alphabet => BigInt(alphabet));

//     const targetWordConverted = wordInputs;

//     let feedback = checkGuess(userInput, targetWord);
//     let feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.startSession(sessionId.toString(), owner.address, commitment);

//     const noirInputs = {
//         targetWord: targetWordConverted,
//         salt: BigInt(salt),
//         session_id: BigInt(sessionId),
//         pedersen_hash: BigInt(commitment), 
//         feedback: feedbackConverted, 
//         userInput: userInputConverted
//     };
  
//     const noirInputsConverted = prepareNoirInputs(noirInputs);
//     console.log({noirInputsConverted});
//     const backend = new UltraHonkBackend(circuit.bytecode);
//     const noir = new Noir(circuit);
//     const { witness } = await noir.execute(noirInputsConverted);
//     const {proof, publicInputs} = await backend.generateProof(witness, {keccak: true});
//     const verified = await backend.verifyProof({proof, publicInputs}, {keccak: true});
//     console.log({verified});
//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     const EXPECTED_BYTES = 440 * 32; // 14,080 bytes
//     // console.log("proof", proof);
//     // console.log("commitment", commitment);
//     let result = await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);

//     userInput = "ABCDEA";
//     feedback = checkGuess(userInput, targetWord);
//     feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);

//     userInput = "LMNOPQ";
//     feedback = checkGuess(userInput, targetWord);
//     feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);
//     userInput = targetWord;
//     feedback = checkGuess(userInput, targetWord);
//     feedbackConverted = feedback.map(f => BigInt(f)); 
//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     // await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);
//     // await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);
//     // await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);

//     // console.log({result});
//     console.log("sessions", await wordleApp.sessions(sessionId));
//     let receipt = await expect(wordleApp.revealWord(sessionId, wordInputs, salt)).to.emit(wordleApp, "GameWon").withArgs(sessionId, owner.address, commitment);
//     await expect(wordleApp.revealWord(sessionId, wordInputs, salt)).not.to.be.reverted;
//     console.log(receipt);
//     }); 

//     it("Update Session", async function () {
//     const { wordleApp } = await loadFixture(deployWordleAppFixture);

//     const [owner] = await hre.ethers.getSigners();

//     const sessionId = BigInt(7018558081055087327022903219186038509231319607451137873687964136067378122800);
//     const commitment = "0x2197362b1dddc4c94d89834ba3941074fda8b4d8eb6786959b4247968c4510ee";

//     await wordleApp.startSession(sessionId.toString(), owner.address, commitment);

//     const feedback = [0, 0, 1, 1, 2, 0];
//     const feedbackConverted = feedback.map(f => BigInt(f));

//     const guess = [0, 1, 2, 3, 4, 5];
//     const guessConverted = guess.map(g => BigInt(g));
    
//     const session1 = await wordleApp.sessions(sessionId);
//     console.log({session1});

//     await wordleApp.updateSession(sessionId, feedbackConverted, guessConverted);

//     const session2 = await wordleApp.sessions(sessionId);
//     console.log({session2});

//     await wordleApp.updateSession(sessionId, feedbackConverted, guessConverted);

//     await wordleApp.updateSession(sessionId, feedbackConverted, guessConverted);
//     await wordleApp.updateSession(sessionId, feedbackConverted, guessConverted);
//     await wordleApp.updateSession(sessionId, feedbackConverted, guessConverted);
//     await wordleApp.updateSession(sessionId, feedbackConverted, guessConverted);

//     // await wordleApp.updateSession(sessionId, feedbackConverted, guessConverted);

//     const session4 = await wordleApp.sessions(sessionId);
//     // console.log(receipt);
//     console.log({session4});
//   });

//   it("Reveal Word - Expect Error", async function () {
//     const { wordleApp } = await loadFixture(deployWordleAppFixture);

//     const [owner] = await hre.ethers.getSigners();
//     const targetWord = pickRandomWord();
//     const sessionId = uint8ArrayToBigIntBE(randomBytesCrypto(64)) % Fr.MODULUS;
//     const salt = uint8ArrayToBigIntBE(randomBytesCrypto(64)) % Fr.MODULUS;
//     console.log("targetWord", targetWord);
//     const bb = await initBarretenberg();
//     const { commitment, wordInputs } = await computePedersenCommmitment(targetWord, sessionId, salt, bb);

//     let userInput = "ABCDEF";
//     const userInputConverted = [...userInput].map(char => {
//         return getAlphabeticIndex(char);
//     }).map(alphabet => BigInt(alphabet));

//     const targetWordConverted = wordInputs;

//     let feedback = checkGuess(userInput, targetWord);
//     let feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.startSession(sessionId.toString(), owner.address, commitment);

//     const noirInputs = {
//         targetWord: targetWordConverted,
//         salt: BigInt(salt),
//         session_id: BigInt(sessionId),
//         pedersen_hash: BigInt(commitment), 
//         feedback: feedbackConverted, 
//         userInput: userInputConverted
//     };
  
//     const noirInputsConverted = prepareNoirInputs(noirInputs);
//     console.log({noirInputsConverted});
//     const backend = new UltraHonkBackend(circuit.bytecode);
//     const noir = new Noir(circuit);
//     const { witness } = await noir.execute(noirInputsConverted);
//     const {proof, publicInputs} = await backend.generateProof(witness, {keccak: true});
//     const verified = await backend.verifyProof({proof, publicInputs}, {keccak: true});
//     console.log({verified});
//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     const EXPECTED_BYTES = 440 * 32; // 14,080 bytes
//     // console.log("proof", proof);
//     // console.log("commitment", commitment);
//     let result = await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);

//     userInput = "ABCDEA";
//     feedback = checkGuess(userInput, targetWord);
//     feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);

//     userInput = "LMNOPQ";
//     feedback = checkGuess(userInput, targetWord);
//     feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);
   
//     // console.log({result});
//     console.log("sessions", await wordleApp.sessions(sessionId));
//     await expect(wordleApp.revealWord(sessionId, targetWordConverted, salt)).to.be.revertedWith("Game not over yet!");
//   });

//   it("Reveal Word - Game Lost", async function () {
//     const { wordleApp } = await loadFixture(deployWordleAppFixture);

//     const [owner] = await hre.ethers.getSigners();
//     const targetWord = pickRandomWord();
//     const sessionId = uint8ArrayToBigIntBE(randomBytesCrypto(64)) % Fr.MODULUS;
//     const salt = uint8ArrayToBigIntBE(randomBytesCrypto(64)) % Fr.MODULUS;
//     console.log("targetWord", targetWord);
//     const bb = await initBarretenberg();
//     const { commitment, wordInputs } = await computePedersenCommmitment(targetWord, sessionId, salt, bb);

//     let userInput = "ABCDEF";
//     const userInputConverted = [...userInput].map(char => {
//         return getAlphabeticIndex(char);
//     }).map(alphabet => BigInt(alphabet));

//     const targetWordConverted = wordInputs;

//     let feedback = checkGuess(userInput, targetWord);
//     let feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.startSession(sessionId.toString(), owner.address, commitment);

//     const noirInputs = {
//         targetWord: targetWordConverted,
//         salt: BigInt(salt),
//         session_id: BigInt(sessionId),
//         pedersen_hash: BigInt(commitment), 
//         feedback: feedbackConverted, 
//         userInput: userInputConverted
//     };
  
//     const noirInputsConverted = prepareNoirInputs(noirInputs);
//     console.log({noirInputsConverted});
//     const backend = new UltraHonkBackend(circuit.bytecode);
//     const noir = new Noir(circuit);
//     const { witness } = await noir.execute(noirInputsConverted);
//     const {proof, publicInputs} = await backend.generateProof(witness, {keccak: true});
//     const verified = await backend.verifyProof({proof, publicInputs}, {keccak: true});
//     console.log({verified});
//     // 1st guess
//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     const EXPECTED_BYTES = 440 * 32; // 14,080 bytes
//     // console.log("proof", proof);
//     // console.log("commitment", commitment);
//     let result = await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);

//     // 2nd guess
//     userInput = "ABCDEA";
//     feedback = checkGuess(userInput, targetWord);
//     feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);

//     // 3rd guess
//     userInput = "LMNOPQ";
//     feedback = checkGuess(userInput, targetWord);
//     feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);

//     let gameOver = await wordleApp.checkIfGameOver(sessionId);
//     console.log({gameOver});

//     // 4th guess
//     userInput = "LMNOPZ";
//     feedback = checkGuess(userInput, targetWord);
//     feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);

//     // 5th guess
//     userInput = "LMNOPQ";
//     feedback = checkGuess(userInput, targetWord);
//     feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);

//     // 6th guess
//     userInput = "LMNOPQ";
//     feedback = checkGuess(userInput, targetWord);
//     feedbackConverted = feedback.map(f => BigInt(f)); 

//     await wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted);
//     await wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment);

//     console.log("sessions", await wordleApp.sessions(sessionId));

//     // 6th guess
//     userInput = "LMNOPQ";
//     feedback = checkGuess(userInput, targetWord);
//     feedbackConverted = feedback.map(f => BigInt(f)); 

//     await expect(wordleApp.updateSession(sessionId, feedbackConverted, userInputConverted)).to.be.revertedWith("Game over!");
//     await expect(wordleApp.verifyGuess(sessionId, userInputConverted, feedbackConverted, Uint8Array.from(proof), publicInputs, commitment)).not.to.be.reverted;
   
//     // console.log({result});
//     console.log("sessions", await wordleApp.sessions(sessionId));
//     await expect(wordleApp.revealWord(sessionId, targetWordConverted, salt)).to.emit(wordleApp, "GameLost").withArgs(sessionId, owner.address, commitment);
//     await expect(wordleApp.revealWord(sessionId, targetWordConverted, salt)).not.to.be.reverted;
//   });
});