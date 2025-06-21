pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

template MerkleTreeRoot(levels) {
    signal input leaves[2**levels];
    signal output root;

    // Total internal nodes (excluding leaves)
    var total_internal_nodes = 2**levels - 1;
    signal nodes[total_internal_nodes];

    component hashers[total_internal_nodes];
    var hasher_idx = 0;

    // First level: hash adjacent leaves
    for (var i = 0; i < 2**(levels-1); i++) {
        hashers[hasher_idx] = Poseidon(2);
        hashers[hasher_idx].inputs[0] <== leaves[2*i];
        hashers[hasher_idx].inputs[1] <== leaves[2*i + 1];
        nodes[hasher_idx] <== hashers[hasher_idx].out;
        hasher_idx++;
    }

    var level_start = 0;
    var level_size = 2**(levels-1);

    for (var level = 0; level < levels; level++) {
        var next_level_size = level_size / 2;
        for (var i = 0; i < next_level_size; i++) {
            hashers[hasher_idx] = Poseidon(2);
            hashers[hasher_idx].inputs[0] <== nodes[level_start + 2*i];
            hashers[hasher_idx].inputs[1] <== nodes[level_start + 2*i + 1];
            nodes[level_start + level_size + i] <== hashers[hasher_idx].out;
            hasher_idx++;
        }
        level_start += level_size;
        level_size = next_level_size;
    }

    root <== nodes[total_internal_nodes - 1];
    log("root", root);
}

component main {public [leaves]} = MerkleTreeRoot(7);