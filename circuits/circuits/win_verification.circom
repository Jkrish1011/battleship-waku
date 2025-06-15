pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "./merkletree.circom";

template RangeCheck(n) {
    signal input in;
    signal output out;

    out <== in;
    assert(in >= 0 && in < n);
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

    var ship_squares = 0;
    for (var i= 0; i < 12; i++) {
        ship_squares += board_state[i];
    }
    ship_squares === hit_count;

    // Count ship squares
    var ship_squares = 0;
    for (var i = 0; i < 100; i++) {
        ship_squares += board_state[i];
    }
    ship_squares === hit_count;

    // Verify all hits
    for (var i = 0; i < 12; i++) {
        component x_check = RangeCheck(10);
        x_check.in = hits[i][0];
        component y_check = RangeCheck(10);
        y_check.in = hits[i][1];

        var idx = hits[i][0] * 10 + hits[i][1];

        board_state[idx] === 1;
    }

    // Verify Merkle Root
    component merkle = MerkleTreeRoot(7);
    for (var i = 0; i < 100; i++) {
        merkle.leaves[i] <== board_state[i];
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