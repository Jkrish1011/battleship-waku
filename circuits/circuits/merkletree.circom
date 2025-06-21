pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

template MerkleTreeRoot(levels) {
    signal input leaves[2**levels];
    signal output root;

    var total_nodes = 2**levels - 1;
    signal nodes[total_nodes];

    component hashers[total_nodes];
    var hasher_idx = 0;

    // Level 0 (leaves) to level 1
    for (var i=0; i< 2**(levels-1); i++) {
        hashers[hasher_idx] = Poseidon(2);
        hashers[hasher_idx].inputs[0] <== leaves[2 * i];
        hashers[hasher_idx].inputs[1] <== leaves[2 * i + 1];
        nodes[i] <== hashers[hasher_idx].out;
        hasher_idx++;
    }

    var level_start = 0;
    var level_size = 2**(levels-1);

    for (var level = 1; level < levels; level++) {
        var next_level_start = level_start + level_size;
        var next_level_size = level_size / 2;

        for (var i=0; i < next_level_size; i++) {
            hashers[hasher_idx] = Poseidon(2);
            hashers[hasher_idx].inputs[0] <== nodes[level_start+ 2 * i];
            hashers[hasher_idx].inputs[1] <== nodes[level_start + 2 * i + 1];
            nodes[next_level_start + i] <== hashers[hasher_idx].out;
            hasher_idx++;
        }

        level_start = next_level_start;
        level_size = next_level_size;
    }

    root <== nodes[total_nodes - 1];
    log("root", root);
}

component main {public [leaves]} = MerkleTreeRoot(7);