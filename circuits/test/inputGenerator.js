const crypto = require("crypto");
const { buildPoseidon } = require("circomlibjs");

class BattleshipInputGenerator {
    constructor() {
        this.poseidon = null;
        this.levels = 7;
    }

    async initialize() {
        this.poseidon = await buildPoseidon();
        this.levels = 7;
    }

    generateSalt() {
        const randomBytes = crypto.randomBytes(32);
        const saltBigInt = BigInt(`0x` + randomBytes.toString("hex"));
        return saltBigInt;
    }
    
    convertToHex(uint8Array) {
        return Array.from(uint8Array)
        .map(byte => byte.toString(16))
        .join('');
    }

    uint8ArrayToBigInt(uint8Array) {
        let result = BigInt(0);
        for (let i = 0; i < uint8Array.length; i++) {
            result = (result << BigInt(8)) | BigInt(uint8Array[i]);
        }
        return result;
    }

    async calculateCommitment(merkleRoot, salt) {
        if (!this.poseidon) {
            throw new Error("Poseidon not initialized. Call initialize() first.");
        }
        
        // Finally, combine board hash with salt
        const finalHash = this.poseidon.F.toString(this.poseidon([merkleRoot, salt]));
        
        // Convert final result to BigInt
        return finalHash;
        
    }

    // Merkle Tree implementation
    async calculateMerkleRoot(boardState) {
        if (!this.poseidon) {
            throw new Error("Poseidon not initialized. Call initialize() first.");
        }

        let leaves = [...boardState];
        while (leaves.length < 128) {
            leaves.push(0);
        }
        // Helper function to hash two elements
        const hash = (left, right) => {
            return this.poseidon.F.toString(this.poseidon([left, right]));
        };

        // Validate input
        if (leaves.length !== 2**this.levels) {
            throw new Error(`Expected ${2**this.levels} leaves, got ${leaves.length}`);
        }

        // Convert all leaves to strings (matching circuit behavior)
        leaves = leaves.map(leaf => leaf.toString());

        // Build tree level by level
        let currentLevel = [...leaves];

        for (let level = 0; level < this.levels; level++) {
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

    async generateCorrectInput(ships, salt = null) {
    
        let boardState = Array(100).fill(0);
        const shipSizes = [3, 3, 2, 2, 2];
    
        console.log("Generating board state from ship placements...\n");
    
        ships.forEach((ship, shipIndex) => {
            const [x, y, length, orientation] = ship;
            console.log(`Ship ${shipIndex + 1}: [${x}, ${y}, ${length}, ${orientation}]`);
            
            let positions = [];
    
            for (let i = 0; i < length; i++) {
                const cellX = x + ((1 - orientation) * i);
                const cellY = y + (orientation * i);
                const cellIndex = cellX * 10 + cellY;
    
                if (cellIndex >= 0 && cellIndex < 100) {
                    boardState[cellIndex] = 1;
                    positions.push(`(${cellX}, ${cellY})`);
                }
            }
            console.log(` Positions: ${positions.join(", ")}`);
        });
    
        console.log("\n Generated Board state");
        console.log(`const boardState = [`);
        for (let row = 0; row < 10; row++) {
            const rowData = boardState.slice(row * 10, (row + 1) * 10);
            console.log(`  ${rowData.join(',')}, // Row ${row}`);
        }
        console.log("];");
    
        console.log("\nBoard visualization:");
        for (let row = 0; row < 10; row++) {
            let rowStr = `${row}: `;
            for (let col = 0; col < 10; col++) {
                const index = row * 10 + col;
                rowStr += boardState[index] === 1 ? '■' : '·';
            }
            console.log(rowStr);
        }
    
        const totalShips = boardState.reduce((sum, cell) => sum + cell, 0);
        const expectedTotal = shipSizes.reduce((sum, size) => sum + size, 0);
    
        console.log(`\nTotal ships: ${totalShips}, Expected: ${expectedTotal}`);

        let currentSalt = salt;
        if (currentSalt === null) {
            currentSalt = this.generateSalt();
        }
        console.log("Salt: ", currentSalt.toString());
    
        const merkleRoot = await this.calculateMerkleRoot(boardState);
        const commitment = await this.calculateCommitment(merkleRoot, currentSalt);
        
        const input = {
            ships: ships,
            board_state: boardState,
            salt: currentSalt.toString(),
            commitment: commitment.toString(), 
            merkle_root: merkleRoot.toString()
        };
        
        console.log("\nComplete input object:");
        console.log(JSON.stringify(input, null, 2));
        
        return input;
    }
    
    validateInput(ships, boardState) {
        console.log("Validating input...");
    
        let expectedBoard = Array(100).fill(0);
        let shipSizes = [3, 3, 2, 2, 2];
    
        const issues = [];
    
        ships.forEach((ship, shipIndex) => {
            const [x, y, length, orientation] = ship;
    
            if (x < 0 || x > 9 || y < 0 || y > 9) {
                issues.push(`Ship ${shipIndex + 1} is out of bounds: (${x}, ${y})`);
            }
    
            if (length !== shipSizes[shipIndex]) {
                issues.push(`Ship ${shipIndex + 1} has incorrect length: ${length} (expected ${shipSizes[shipIndex]})`);
            }
    
            if (orientation !== 0 && orientation !== 1) {
                issues.push(`Ship ${shipIndex + 1} has invalid orientation: ${orientation} (expected 0 or 1)`);
            }
    
            // Calculate End Positions.
            const endX = x + (1- orientation) * (length - 1);
            const endY = y + orientation * (length - 1);
    
            if (endX > 9 || endY > 9 ) {
                issues.push(`Ship ${shipIndex + 1} extends beyond the board: (${endX}, ${endY})`);
            }
    
            // Check if the ship overlaps with other ships.
            for (let i = 0; i < length; i++) {
                const cellX = x + ((1 - orientation) * i);
                const cellY = y + (orientation * i);
                const cellIndex = cellX * 10 + cellY;
    
                if (cellIndex >= 0 && cellIndex < 100) {
                    if (expectedBoard[cellIndex] === 1) {
                        issues.push(`Ship ${shipIndex + 1} overlaps with another ship at (${cellX}, ${cellY})`);
                    }
                    expectedBoard[cellIndex] = 1;
                }
            }
        });
        
        // Compare expectedBoard with boardState
        let mismatches = 0;
        for (let i = 0; i < 100; i++) {
            if (expectedBoard[i] !== boardState[i]) {
                mismatches++;
                const x = Math.floor(i / 10);
                const y = i % 10;
                issues.push(`Mismatch at (${x}, ${y}): expected ${expectedBoard[i]}, got ${boardState[i]}`);
            }
        }
    
        if (issues.length > 0) {
            console.log("\nValidation issues:");
            issues.forEach((issue) => console.log(`- ${issue}`));
        } else {
            console.log("\nValidation successful!");
        }
    }
}

if (require.main === module) {
    (async() => {
        console.log("Running input generator...");

        const generator = new BattleshipInputGenerator();
        await generator.initialize();
        
        // Test conversions first
        // generator.testConversions();

        console.log("\n" + "=".repeat(50));

        const yourShips = [
            [3, 1, 3, 0], // Ship 1: Vertical 3-length at (1,1)
            [5, 4, 3, 1], // Ship 2: Horizontal 3-length at (3,2) 
            [7, 5, 2, 0], // Ship 3: Vertical 2-length at (5,5)
            [1, 8, 2, 1], // Ship 4: Horizontal 2-length at (7,2)
            [8, 8, 2, 0]  // Ship 5: Vertical 2-length at (0,8)
        ];

        const correctInput = await generator.generateCorrectInput(yourShips);
        
        console.log("\nValidating your original input:");
        generator.validateInput(yourShips, correctInput.board_state);

    })();
}

module.exports = {
    BattleshipInputGenerator,
};