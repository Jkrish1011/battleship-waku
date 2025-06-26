const crypto = require("crypto");
const { buildPoseidon } = require("circomlibjs");
const snarkjs = require("snarkjs");

class BattleshipGameGenerator {
    constructor() {
        this.poseidon = null;
        this.levels = 7;
        this.shipSizes = [3, 3, 2, 2, 2];
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
    
        console.log("Generating board state from ship placements...\n");
    
        ships.forEach((ship, shipIndex) => {
            const [x, y, length, orientation] = ship;
    
            for (let i = 0; i < length; i++) {
                const cellX = x + ((1 - orientation) * i);
                const cellY = y + (orientation * i);
                const cellIndex = cellX * 10 + cellY;
    
                if (cellIndex >= 0 && cellIndex < 100) {
                    boardState[cellIndex] = 1;
                }
            }
        });
    
        // console.log("\n Generated Board state");
        // console.log(`const boardState = [`);
        // for (let row = 0; row < 10; row++) {
        //     const rowData = boardState.slice(row * 10, (row + 1) * 10);
        //     console.log(`  ${rowData.join(',')}, // Row ${row}`);
        // }
        // console.log("];");
    
        console.log("\nBoard visualization:");
        for (let row = 0; row < 10; row++) {
            let rowStr = `${row}: `;
            for (let col = 0; col < 10; col++) {
                const index = row * 10 + col;
                rowStr += boardState[index] === 1 ? '■' : '·';
            }
            console.log(rowStr);
        }
    
        // const totalShips = boardState.reduce((sum, cell) => sum + cell, 0);
        // const expectedTotal = this.shipSizes.reduce((sum, size) => sum + size, 0);
    
        // console.log(`\nTotal ships: ${totalShips}, Expected: ${expectedTotal}`);

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
        
        // console.log("\nComplete input object:");
        // console.log(JSON.stringify(input, null, 2));
        
        return input;
    }

    calculateShipPositions(ships) {
        let positions = [];
        ships.forEach((ship) => {
            const [x, y, length, orientation] = ship;

            for (let i = 0; i < length; i++) {
                const cellX = x + ((1 - orientation) * i);
                const cellY = y + (orientation * i);
                const cellIndex = cellX * 10 + cellY;
    
                if (cellIndex >= 0 && cellIndex < 100) {
                    positions.push([cellX, cellY]);
                }
            }
        });
        return positions;
    }

    generateRandomShipPositions() {
        let shipPositions = [];

        for (let i = 0; i < this.shipSizes.length; i++) {
            const length = this.shipSizes[i];
            const orientation = Math.random() < 0.5 ? 0 : 1;
            let x = Math.floor(Math.random() * 10);
            let y = Math.floor(Math.random() * 10);
            while (x + (1 - orientation) * (length - 1) < 0 || y + orientation * (length - 1) < 0 || x + (1 - orientation) * (length - 1) > 9 || y + orientation * (length - 1) > 9) {
                x = Math.floor(Math.random() * 10);
                y = Math.floor(Math.random() * 10);
            }
            shipPositions.push([x, y, length, orientation]);
        }
        return shipPositions;
    }

    async generateShipPlacementPositions(shipPositions) {
        const correctInput = await this.generateCorrectInput(shipPositions);
        return correctInput;
    }
    
    validateInput(ships, boardState) {
        console.log("Validating input...");
    
        let expectedBoard = Array(100).fill(0);
    
        const issues = [];
    
        ships.forEach((ship, shipIndex) => {
            const [x, y, length, orientation] = ship;
    
            if (x < 0 || x > 9 || y < 0 || y > 9) {
                issues.push(`Ship ${shipIndex + 1} is out of bounds: (${x}, ${y})`);
            }
    
            if (length !== this.shipSizes[shipIndex]) {
                issues.push(`Ship ${shipIndex + 1} has incorrect length: ${length} (expected ${this.shipSizes[shipIndex]})`);
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

        if (issues.length > 0) {
            console.log("\nValidation issues:");
            issues.forEach((issue) => console.log(`- ${issue}`));
            return false;
        }
        
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
            console.log("returning false");
            return false;
        } else {
            console.log("\nValidation successful!");
            console.log("returning true");
            return true;
        }
    }

    buffer32BytesToBigIntBE(buf) {
        return (
          (buf.readBigUInt64BE(0) << 192n) +
          (buf.readBigUInt64BE(8) << 128n) +
          (buf.readBigUInt64BE(16) << 64n) +
          buf.readBigUInt64BE(24)
        );
    }

    randomBytesCrypto(len) {
        if (len > 32) throw new Error("Length must be ≤ 32 for uint256 compatibility");
        const bytes = new Uint8Array(crypto.randomBytes(len));
        const buffer = Buffer.from(bytes);
        return this.buffer32BytesToBigIntBE(buffer);
    }
    
    async generateProof(input, wasmContent, zkeyContent) {
        const proof = await snarkjs.groth16.fullProve(input, wasmContent, zkeyContent);
        const calldataStr = await snarkjs.groth16.exportSolidityCallData(proof.proof, proof.publicSignals);
        const calldata = JSON.parse("[" + calldataStr + "]");
        return calldata;
    }

    toHex(decimal) {
        return '0x' + BigInt(decimal).toString(16);
    }
}

module.exports = {
    BattleshipGameGenerator,
};