pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/multiplexer.circom";
include "circomlib/circuits/binsum.circom";  // For Num2Bits
include "./merkletree.circom";

template RangeCheck(n) {
    signal input in;
    signal output out;
    
    component lt = LessThan(8);
    lt.in[0] <== in;
    lt.in[1] <== n;
    lt.out === 1;
    
    component gte = GreaterEqThan(8);
    gte.in[0] <== in;
    gte.in[1] <== 0;
    gte.out === 1;
    
    out <== in;
}

template MoveVerification() {
    signal input board_state[100];
    signal input guess_x;
    signal input guess_y;
    signal input salt;

    signal input commitment;
    signal input merkle_root;
    signal input hit;

    // Validate guess coordinates
    component x_check = RangeCheck(10);
    x_check.in <== guess_x; 
    
    component y_check = RangeCheck(10);
    y_check.in <== guess_y; 


    // Validate board cells are binary
    for (var i = 0; i < 100; i++) {
        board_state[i] * (board_state[i] - 1) === 0;
    }

    // Calculate the 1D index from 2D coordinates
    signal guess_index;
    guess_index <== guess_x * 10 + guess_y;
    
    // Verify guess index is within range
    component index_check = RangeCheck(100);
    index_check.in <== guess_index;

    // Use Multiplexer to verify hit result matches board state at guessed position
    component mux = Multiplexer(1, 100); // 1-bit output, 100 possible positions
    
    // Connect all board positions to multiplexer inputs
    for (var i = 0; i < 100; i++) {
        mux.inp[i][0] <== board_state[i];
    }
    
    // Connect the guess index as selector
    mux.sel <== guess_index;
    
    // Get the result from multiplexer and verify it matches the hit signal
    signal hit_result;
    hit_result <== mux.out[0];
    
    // Verify that the hit signal matches the board state at guess_index
    hit === hit_result;

    // Verify Merkle Root
    component merkle = MerkleTreeRoot(7);
    for (var i = 0; i < 100; i++) {
        merkle.leaves[i] <== board_state[i];
    }
    for (var i = 100; i < 128; i++) {
        merkle.leaves[i] <== 0;
    }
    merkle.root === merkle_root;

    // Verify commitment
    component commitment_hash = Poseidon(2);
    commitment_hash.inputs[0] <== merkle.root;
    commitment_hash.inputs[1] <== salt;
    commitment === commitment_hash.out;
}

component main {public [commitment, merkle_root, hit]} = MoveVerification();