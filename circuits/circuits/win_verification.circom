pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/pedersen.circom";
include "./merkletree.circom";

template RangeCheck(n) {
    signal input in;
    signal output out;
    
    // Use constraint-based validation instead of assert
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

template WinVerification() {
    signal input board_state[100]; // Private: 10x10 grid
    signal input hits[12][2]; // Private: Array of 12 hits (x, y)
    signal input salt; // Private: Blinding factor for the merkle tree

    signal input commitment; // public: Pedersen Commitment
    signal input merkle_root; // Public
    signal input hit_count; // Public
    
    // Verify Hit count
    hit_count === 12;

    // Validate each board cell is binary (0 or 1)
    for (var i = 0; i < 100; i++) {
        board_state[i] * (board_state[i] - 1) === 0;
    }

    // Count total ship squares on the board
    signal total_ship_squares;
    // For intermediate sum.
    signal running_sum[101];

    running_sum[0] <== 0;

    for (var i = 0; i < 100; i++) {
        running_sum[i+1] <== running_sum[i] + board_state[i];
    }
    total_ship_squares <== running_sum[100];

    // Verify total ship squares equals 12 (3+3+2+2+2=12)
    total_ship_squares === hit_count;

    component x_checks[12];
    component y_checks[12];
    signal hit_index[12];

    // Verify this position contains a ship (board_state = 1)
    // Use multiplier array pattern to avoid variable index access
        
    signal hit_selector[12][100];
    signal hit_value[12];
    component index_equals[12][100];
    signal hit_accumulator[12][101]; // Intermediate accumulation signals
    // Verify all hits
    for (var i = 0; i < 12; i++) {
        // Validate hit coordinates are within bounds
        x_checks[i] = RangeCheck(10);
        x_checks[i].in <== hits[i][0];

        y_checks[i] = RangeCheck(10);
        y_checks[i].in <== hits[i][1];

        // Calculate 1D index from 2D coordinates
        hit_index[i] <== hits[i][0] * 10 + hits[i][1];
        
        
        // Create selector array where only the target index is 1, others are 0
        
        for (var j = 0; j < 100; j++) {
            index_equals[i][j] = IsEqual();
            index_equals[i][j].in[0] <== hit_index[i];
            index_equals[i][j].in[1] <== j;
            hit_selector[i][j] <== index_equals[i][j].out;
        }
        
        // Multiply each board state by its selector and sum to get the target value
        hit_accumulator[i][0] <== 0;
        for (var j = 0; j < 100; j++) {
            hit_accumulator[i][j+1] <== hit_accumulator[i][j] + board_state[j] * hit_selector[i][j];
        }
        hit_value[i] <== hit_accumulator[i][100];
        
        // Verify the selected position contains a ship
        hit_value[i] === 1;
    }

    signal idx_i[12];
    signal idx_j[12][12];
    component neq_out[12][12];
    // Verify no duplicate hits (each hit position should be unique)
    // This prevents counting the same ship square multiple times
    for (var i = 0; i < 12; i++) {
        // Calculate indices for comparison
        idx_i[i] <== hits[i][0] * 10 + hits[i][1];
        
        for (var j = i + 1; j < 12; j++) {
            idx_j[i][j] <== hits[j][0] * 10 + hits[j][1];
            // Ensure indices are different
            neq_out[i][j] = IsEqual();
            neq_out[i][j].in[0] <== idx_i[i];
            neq_out[i][j].in[1] <== idx_j[i][j];
            neq_out[i][j].out === 0; // Should not be equal
        }
    }

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

    // Verify Commitment
    component pedersen = Pedersen(101);
    for (var i = 0; i < 100; i++) {
        pedersen.in[i] <== board_state[i];
    }
    pedersen.in[100] <== salt;
    commitment === pedersen.out[0];
}

component main {public [commitment, merkle_root, hit_count]} = WinVerification();