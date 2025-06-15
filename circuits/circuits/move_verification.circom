pragma circom 2.0.0;

include "circomlib/circuits/pedersen.circom";
include "./merkletree.circom";

template RangeCheck(n) {
    signal input in;
    signal output out;

    out <== in;
    assert(in >=0 && in < n);
}

template MoveVerification() {
    signal input board_state[100]; // Private: 10x10 grid
    signal input guess_x; // Private 
    signal input guess_y; // Private 
    signal input salt; // Private: Blinding factor for the merkle tree

    signal input commitment; // public: Pedersen Commitment
    signal input merkle_root; // Public: Merkle Root of the board state
    signal input hit; // public: 1 if hit, 0 if miss

    // Validate guess
    component x_check = RangeCheck(10);
    x_check.in = guess_x;
    component y_check = RangeCheck(10);
    y_check.in = guess_y;

    hit === board_state[guess_x * 10 + guess_y];

    // Verify Merkle Root
    component merkle = MerkleTreeRoot(7);
    for (var i = 0; i < 100; i++) {
        merkle.leaves[i] <== board_state[i];
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

