// test/helpers/circuitHelpers.js
const circomlib = require("circomlib");
const { groth16 } = require("snarkjs");
const path = require("path");

class CircuitTestHelper {
    constructor() {
        this.poseidon = circomlib.poseidon;
        this.F = circomlib.babyjub.F;
    }

    /**
     * Calculate Pedersen commitment for board state and salt
     * @param {Array} boardState - 100-element array of 0s and 1s
     * @param {BigInt} salt - Random salt value
     * @returns {BigInt} - Pedersen commitment
     */
    calculateCommitment(boardState, salt) {
        const inputs = [...boardState, salt];
        return this.poseidon(inputs);
    }

    /**
     * Calculate Merkle root for board state (simplified for testing)
     * @param {Array} boardState - 100-element array of 0s and 1s
     * @returns {BigInt} - Merkle root hash
     */
    calculateMerkleRoot(boardState) {
        // Pad to 128 elements (next power of 2 after 100)
        const paddedLeaves = [...boardState];
        while (paddedLeaves.length < 128) {
            paddedLeaves.push(0);
        }
        
        // Build Merkle tree bottom-up
        let currentLevel = paddedLeaves.map(leaf => this.poseidon([leaf]));
        
        while (currentLevel.length > 1) {
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : this.F.zero;
                nextLevel.push(this.poseidon([left, right]));
            }
            currentLevel = nextLevel;
        }
        
        return currentLevel[0];
    }

    /**
     * Generate board state from ship placements
     * @param {Array} ships - Array of [x, y, length, orientation] for each ship
     * @returns {Array} - 100-element board state array
     */
    generateBoardStateFromShips(ships) {
        const boardState = new Array(100).fill(0);
        const shipSizes = [3, 3, 2, 2, 2];
        
        for (let s = 0; s < ships.length; s++) {
            const [startX, startY, length, orientation] = ships[s];
            
            // Validate ship length matches expected
            if (length !== shipSizes[s]) {
                throw new Error(`Ship ${s} has incorrect length. Expected ${shipSizes[s]}, got ${length}`);
            }
            
            // Place ship on board
            for (let i = 0; i < length; i++) {
                const x = orientation === 0 ? startX + i : startX;
                const y = orientation === 1 ? startY + i : startY;
                
                // Convert 2D coordinates to 1D index
                const index = x * 10 + y;
                
                // Check bounds
                if (x < 0 || x >= 10 || y < 0 || y >= 10) {
                    throw new Error(`Ship ${s} extends out of bounds at position (${x}, ${y})`);
                }
                
                // Check for overlaps
                if (boardState[index] === 1) {
                    throw new Error(`Ship ${s} overlaps with another ship at position (${x}, ${y})`);
                }
                
                boardState[index] = 1;
            }
        }
        
        return boardState;
    }

    /**
     * Generate valid test input for ShipPlacement circuit
     * @param {Array} ships - Ship placements
     * @param {BigInt} salt - Optional salt (random if not provided)
     * @returns {Object} - Complete circuit input
     */
    generateValidShipPlacementInput(ships, salt = null) {
        if (salt === null) {
            salt = BigInt(Math.floor(Math.random() * 1000000000000000));
        }
        
        const boardState = this.generateBoardStateFromShips(ships);
        const commitment = this.calculateCommitment(boardState, salt);
        const merkleRoot = this.calculateMerkleRoot(boardState);
        
        return {
            ships: ships,
            board_state: boardState,
            salt: salt.toString(),
            commitment: commitment.toString(),
            merkle_root: merkleRoot.toString()
        };
    }

    /**
     * Generate random valid ship placement
     * @returns {Array} - Array of 5 ships with valid placements
     */
    generateRandomValidShips() {
        const ships = [];
        const shipSizes = [3, 3, 2, 2, 2];
        const occupiedCells = new Set();
        
        for (let i = 0; i < 5; i++) {
            let placed = false;
            let attempts = 0;
            
            while (!placed && attempts < 100) {
                const orientation = Math.floor(Math.random() * 2); // 0 or 1
                const length = shipSizes[i];
                
                let startX, startY;
                if (orientation === 0) { // Horizontal
                    startX = Math.floor(Math.random() * (10 - length + 1));
                    startY = Math.floor(Math.random() * 10);
                } else { // Vertical
                    startX = Math.floor(Math.random() * 10);
                    startY = Math.floor(Math.random() * (10 - length + 1));
                }
                
                // Check if placement is valid (no overlaps)
                let canPlace = true;
                const cellsToOccupy = [];
                
                for (let j = 0; j < length; j++) {
                    const x = orientation === 0 ? startX + j : startX;
                    const y = orientation === 1 ? startY + j : startY;
                    const cellIndex = x * 10 + y;
                    
                    if (occupiedCells.has(cellIndex)) {
                        canPlace = false;
                        break;
                    }
                    cellsToOccupy.push(cellIndex);
                }
                
                if (canPlace) {
                    ships.push([startX, startY, length, orientation]);
                    cellsToOccupy.forEach(cell => occupiedCells.add(cell));
                    placed = true;
                }
                
                attempts++;
            }
            
            if (!placed) {
                throw new Error(`Could not place ship ${i} after 100 attempts`);
            }
        }
        
        return ships;
    }

    /**
     * Create test scenarios for boundary conditions
     * @returns {Object} - Object with various test scenarios
     */
    getBoundaryTestScenarios() {
        return {
            // Ships at extreme edges
            maxRightHorizontal: [
                [7, 0, 3, 0], // Rightmost possible 3-length horizontal
                [0, 1, 3, 0],
                [8, 2, 2, 0], // Rightmost possible 2-length horizontal
                [0, 3, 2, 0],
                [0, 4, 2, 0]
            ],
            
            maxBottomVertical: [
                [0, 7, 3, 1], // Bottom-most possible 3-length vertical
                [1, 0, 3, 0],
                [2, 8, 2, 1], // Bottom-most possible 2-length vertical
                [3, 0, 2, 0],
                [4, 0, 2, 0]
            ],
            
            cornerPlacements: [
                [0, 0, 3, 0], // Top-left corner horizontal
                [0, 9, 3, 0], // Bottom-left corner horizontal
                [7, 0, 3, 0], // Top-right corner horizontal
                [0, 0, 2, 1], // This will overlap with first ship - invalid
                [2, 0, 2, 0]
            ],
            
            // Invalid boundary cases
            outOfBoundsRight: [
                [8, 0, 3, 0], // Would extend to x=10 (out of bounds)
                [0, 1, 3, 0],
                [0, 2, 2, 0],
                [0, 3, 2, 0],
                [0, 4, 2, 0]
            ],
            
            outOfBoundsBottom: [
                [0, 0, 3, 0],
                [0, 8, 3, 1], // Would extend to y=10 (out of bounds)
                [0, 2, 2, 0],
                [0, 3, 2, 0],
                [0, 4, 2, 0]
            ]
        };
    }

    /**
     * Validate ship placement rules
     * @param {Array} ships - Ship placements to validate
     * @returns {Object} - Validation result with details
     */
    validateShipPlacement(ships) {
        const result = {
            valid: true,
            errors: []
        };
        
        const shipSizes = [3, 3, 2, 2, 2];
        const occupiedCells = new Set();
        
        // Check we have exactly 5 ships
        if (ships.length !== 5) {
            result.valid = false;
            result.errors.push(`Expected 5 ships, got ${ships.length}`);
            return result;
        }
        
        for (let i = 0; i < ships.length; i++) {
            const [startX, startY, length, orientation] = ships[i];
            
            // Validate ship length
            if (length !== shipSizes[i]) {
                result.valid = false;
                result.errors.push(`Ship ${i}: Expected length ${shipSizes[i]}, got ${length}`);
            }
            
            // Validate orientation
            if (orientation !== 0 && orientation !== 1) {
                result.valid = false;
                result.errors.push(`Ship ${i}: Invalid orientation ${orientation}, must be 0 or 1`);
            }
            
            // Validate coordinates
            if (startX < 0 || startX >= 10 || startY < 0 || startY >= 10) {
                result.valid = false;
                result.errors.push(`Ship ${i}: Invalid start coordinates (${startX}, ${startY})`);
                continue;
            }
            
            // Check bounds
            const endX = orientation === 0 ? startX + length - 1 : startX;
            const endY = orientation === 1 ? startY + length - 1 : startY;
            
            if (endX >= 10 || endY >= 10) {
                result.valid = false;
                result.errors.push(`Ship ${i}: Extends out of bounds. End position: (${endX}, ${endY})`);
                continue;
            }
            
            // Check for overlaps
            for (let j = 0; j < length; j++) {
                const x = orientation === 0 ? startX + j : startX;
                const y = orientation === 1 ? startY + j : startY;
                const cellIndex = x * 10 + y;
                
                if (occupiedCells.has(cellIndex)) {
                    result.valid = false;
                    result.errors.push(`Ship ${i}: Overlaps with another ship at position (${x}, ${y})`);
                } else {
                    occupiedCells.add(cellIndex);
                }
            }
        }
        
        return result;
    }

    /**
     * Generate proof for circuit (for integration testing)
     * @param {Object} input - Circuit input
     * @param {string} wasmPath - Path to circuit WASM file
     * @param {string} zkeyPath - Path to circuit zkey file
     * @returns {Object} - Generated proof and public signals
     */
    async generateProof(input, wasmPath, zkeyPath) {
        try {
            const { proof, publicSignals } = await groth16.fullProve(
                input,
                wasmPath,
                zkeyPath
            );
            return { proof, publicSignals };
        } catch (error) {
            throw new Error(`Proof generation failed: ${error.message}`);
        }
    }

    /**
     * Verify proof (for integration testing)
     * @param {Object} proof - Generated proof
     * @param {Array} publicSignals - Public signals
     * @param {string} vkeyPath - Path to verification key
     * @returns {boolean} - Verification result
     */
    async verifyProof(proof, publicSignals, vkeyPath) {
        try {
            const vKey = JSON.parse(require('fs').readFileSync(vkeyPath));
            const res = await groth16.verify(vKey, publicSignals, proof);
            return res;
        } catch (error) {
            throw new Error(`Proof verification failed: ${error.message}`);
        }
    }

    /**
     * Print board state in a readable format (for debugging)
     * @param {Array} boardState - 100-element board state array
     */
    printBoardState(boardState) {
        console.log("Board State:");
        console.log("  0123456789");
        for (let y = 0; y < 10; y++) {
            let row = `${y} `;
            for (let x = 0; x < 10; x++) {
                const index = x * 10 + y;
                row += boardState[index] === 1 ? '█' : '·';
            }
            console.log(row);
        }
        console.log();
    }

    /**
     * Convert 1D board index to 2D coordinates
     * @param {number} index - 1D index (0-99)
     * @returns {Object} - {x, y} coordinates
     */
    indexToCoords(index) {
        return {
            x: Math.floor(index / 10),
            y: index % 10
        };
    }

    /**
     * Convert 2D coordinates to 1D board index
     * @param {number} x - X coordinate (0-9)
     * @param {number} y - Y coordinate (0-9)
     * @returns {number} - 1D index (0-99)
     */
    coordsToIndex(x, y) {
        return x * 10 + y;
    }
}

module.exports = { CircuitTestHelper };