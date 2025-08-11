const crypto = require("crypto");
const { buildPoseidon } = require("circomlibjs");
const { BattleshipInputGenerator } = require("./inputGenerator");

class BattleshipMoveGenerator {
    constructor() {
        this.poseidon = null;
        this.gameStateGenerator = null;
    }

    async initialize() {
        this.poseidon = await buildPoseidon();
        this.gameStateGenerator = new BattleshipInputGenerator();
        await this.gameStateGenerator.initialize();
    }

    async generateGameState(ships, salt = null) {
        const gameState = await this.gameStateGenerator.generateCorrectInput(ships, salt);
        this.gameStateGenerator.validateInput(ships, gameState.board_state);
        return gameState;
    }
}

if (require.main === module) {
    (async() => {
        console.log("Running move generator...");

        const moveGenerator = new BattleshipMoveGenerator();
        await moveGenerator.initialize();

        console.log("\n" + "=".repeat(50));

        const ships = [
            [3, 1, 3, 0], // Ship 1: Vertical 3-length at (1,1)
            [5, 4, 3, 1], // Ship 2: Horizontal 3-length at (3,2) 
            [7, 5, 2, 0], // Ship 3: Vertical 2-length at (5,5)
            [1, 8, 2, 1], // Ship 4: Horizontal 2-length at (7,2)
            [8, 8, 2, 0]  // Ship 5: Vertical 2-length at (0,8)
        ];

        const salt = BigInt("111932274919168185007333401134409959455837854918323534429202520910593105337309");
        const gameState = await moveGenerator.generateGameState(ships, salt);
        const guess = [5,6];
        const commitment = gameState.commitment;
        const merkleRoot = gameState.merkle_root;
        const boardState = gameState.board_state;
        
        const hit = 1;

        const moveJson = {
            salt: salt.toString(),
            ship_placement_commitment: commitment,
            merkle_root: merkleRoot,
            previous_move_hash: 0,
            move_count: 0,
            game_id: 1,
            player_id: 0,
            board_state: boardState,
            hit: hit,
            guess_x: guess[0],
            guess_y: guess[1]
        };

        console.log("\nComplete input object:");
        console.log(JSON.stringify(moveJson, null, 2));

    })();
}


module.exports = {
    BattleshipInputGenerator,
};