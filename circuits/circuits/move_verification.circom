pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/pedersen.circom";
include "circomlib/circuits/multiplexer.circom";
include "./merkletree.circom";

template RangeCheck(n) {
    signal input in;
    signal output out;
    
    // Use constraint-based validation instead of assert
    component lt = LessThan(8); // 8 bits is enough for values 0-99
    lt.in[0] <== in;
    lt.in[1] <== n;
    lt.out === 1;
    
    // Also ensure non-negative (though this is implicit with LessThan from 0)
    component gte = GreaterEqThan(8);
    gte.in[0] <== in;
    gte.in[1] <== 0;
    gte.out === 1;
    
    out <== in;
}

// template GuessVerification() {
//     // Input signals
//     signal input guess_index;  // The index to check (0-99 for a 10x10 board)
//     signal input hit;         // The hit signal to verify against
//     signal input board_state[100];  // The state of the board (100 positions)

//     // Calculate the hit result using multiplexer
//     component mux = Multiplexer(1, 100);  // 1-bit output, 100 possible positions
    
//     // Connect all board positions to multiplexer inputs
//     for (var i = 0; i < 100; i++) {
//         mux.inp[i][0] <== board_state[i];
//     }
    
//     // Connect the guess index as selector
//     mux.sel <== guess_index;
    
//     // Get the result from multiplexer
//     signal hit_result;
//     hit_result <== mux.out[0];
    
//     // Verify that the hit signal matches the board state at guess_index
//     hit === hit_result;
// }

template MoveVerification() {
    signal input board_state[100]; // Private: 10x10 grid
    signal input guess_x; // Private 
    signal input guess_y; // Private 
    signal input salt; // Private: Blinding factor for the merkle tree

    signal input commitment; // public: Pedersen Commitment
    signal input merkle_root; // Public: Merkle Root of the board state
    signal input hit; // public: 1 if hit, 0 if miss

    // Validate guess coordinates are within bounds (0-9)
    component x_check = RangeCheck(10);
    x_check.in <== guess_x; 
    
    component y_check = RangeCheck(10);
    y_check.in <== guess_y; 

    // Validate each board cell is binary (0 or 1)
    for (var i = 0; i < 100; i++) {
        board_state[i] * (board_state[i] - 1) === 0;
    }

    // Calculate the 1D index from 2D coordinates
    signal guess_index <== guess_x * 10 + guess_y;
    
    // Calculate the hit result using multiplexer
    component mux = Multiplexer(1, 100);  // 1-bit output, 100 possible positions
    
    // Connect all board positions to multiplexer inputs
    for (var i = 0; i < 100; i++) {
        mux.inp[i][0] <== board_state[i];
    }
    
    // Connect the guess index as selector
    mux.sel <== guess_index;
    
    // Get the result from multiplexer
    signal hit_result;
    hit_result <== mux.out[0];
    
    // Verify that the hit signal matches the board state at guess_index
    hit === hit_result;

    // Verify Merkle Root
    component merkle = MerkleTreeRoot(7);
    for (var i = 0; i < 100; i++) {
        merkle.leaves[i] <== board_state[i];
    }
    // Pad remaining leaves with zeros for complete binary tree
    for (var i = 100; i < 128; i++) {
        merkle.leaves[i] <== 0;
    }
    merkle.root === merkle_root;

    // Verify commitment
    component pedersen = Pedersen(101);
    for (var i = 0; i < 100; i++) {
        pedersen.in[i] <== board_state[i];
    }
    pedersen.in[100] <== salt;
    commitment === pedersen.out[0];
}

component main {public [commitment, merkle_root, hit]} = MoveVerification();

