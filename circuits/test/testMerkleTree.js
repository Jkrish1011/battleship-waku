const { buildPoseidon } = require("circomlibjs");

async function calculateMerkleRoot(leaves, levels) {
    // Initialize Poseidon hash
    const poseidon = await buildPoseidon();
    
    // Helper function to hash two elements
    const hash = (left, right) => {
        return poseidon.F.toString(poseidon([left, right]));
    };

    // Validate input
    if (leaves.length !== 2**levels) {
        throw new Error(`Expected ${2**levels} leaves, got ${leaves.length}`);
    }

    // Convert all leaves to strings (matching circuit behavior)
    leaves = leaves.map(leaf => leaf.toString());

    // Build tree level by level
    let currentLevel = [...leaves];
    
    for (let level = 0; level < levels; level++) {
        const nextLevel = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i+1] || currentLevel[i]; // if odd number, duplicate last
            nextLevel.push(hash(left, right));
        }
        currentLevel = nextLevel;
    }

    // The root is the only element left
    return currentLevel[0];
}

// Example usage:
async function test() {
    const levels = 7;
    const leaves = [
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
    
    const root = await calculateMerkleRoot(leaves, levels);
    console.log("Merkle Root:", root);
}

test().catch(console.error);

module.exports = {
    calculateMerkleRoot
}