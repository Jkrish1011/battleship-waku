const { buildPoseidon } = require("circomlibjs");
const { calculateMerkleRoot } = require("./testMerkleTree");

async function generateBoardCommitment(merkleRoot, salt) {
    const poseidon = await buildPoseidon();

    // Helper function to hash two elements
    const hash = (left, right) => {
        return poseidon.F.toString(poseidon([left, right]));
    };

    const commitment = hash(merkleRoot, salt);
    return commitment;
}

async function test() {
    const salt = "62546678035666297782558880919642288614801255139389511275810748286179884007974";
    const boardState = [
        0,0,0,0,0,0,0,0,1,0, 
        0,1,0,0,0,0,0,0,1,0, 
        0,1,0,0,0,0,0,0,0,0, 
        0,1,0,0,0,0,0,0,0,0, 
        0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,1,0,0,0,0, 
        0,0,0,0,0,1,0,0,0,0, 
        0,0,1,1,0,0,0,0,0,0, 
        0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,1,1,1,0,0,0,
        0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0
      ].map(n => n.toString());
    const merkleRoot = await calculateMerkleRoot(boardState, 7);
    console.log("Merkle Root:", merkleRoot);
    const commitment = await generateBoardCommitment(merkleRoot, BigInt(salt));
    console.log("Board Commitment:", commitment);
}

test().catch(console.error);