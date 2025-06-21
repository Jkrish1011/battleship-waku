pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";
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

template InRange() {
    signal input in;
    signal input min;
    signal input max;

    signal output out;
    // 8 bits because the grid is 10x10.
    component gte = LessEqThan(8);
    gte.in[0] <== min;
    gte.in[1] <== in;

    component lte = LessEqThan(8);
    lte.in[0] <== in;
    lte.in[1] <== max;

    out <== gte.out * lte.out;
}

template CellOccupied() {
    signal input cell_x;
    signal input cell_y;
    signal input ship_start_x;
    signal input ship_start_y;
    signal input ship_length;
    signal input ship_orientation;

    signal output occupied;

    // Calculate ship end coordinates.
    signal end_x <== ship_start_x + (1 - ship_orientation) * (ship_length -1);
    signal end_y <== ship_start_y + ship_orientation * (ship_length - 1);

    // For horizontal ships: end_x = start_x + length - 1, end_y = start_y. Only X changes here.
    // For vertical ships: end_x = start_x, end_y = start_y + length - 1. Only Y changes here.

    // Check if cell is within ship bounds
    component x_in_range = InRange();
    x_in_range.in <== cell_x;
    x_in_range.min <== ship_start_x;
    x_in_range.max <== end_x;
    
    component y_in_range = InRange();
    y_in_range.in <== cell_y;
    y_in_range.min <== ship_start_y;
    y_in_range.max <== end_y;
    
    // Cell is occupied if it's in range for both X and Y
    occupied <== x_in_range.out * y_in_range.out;
}

template ValidateShipBounds() {
    signal input ship_start_x;
    signal input ship_start_y;
    signal input ship_length;
    signal input ship_orientation;

    signal output valid;

    // Calculate end coordinates
    signal end_x <== ship_start_x + (1 - ship_orientation) * (ship_length -1);
    signal end_y <== ship_start_y + ship_orientation * (ship_length - 1);

    // Checking if the coordinates are within the 10x10 grid.
     component x_bound = LessEqThan(8);
    x_bound.in[0] <== end_x;
    x_bound.in[1] <== 9;  // Max coordinate is 9
    
    component y_bound = LessEqThan(8);
    y_bound.in[0] <== end_y;
    y_bound.in[1] <== 9;  // Max coordinate is 9
    
    valid <== x_bound.out * y_bound.out;
}

template ShipPlacement() {
    signal input ships[5][4]; // Private: [start_x, start_y, length, orientation(0=horizontal, 1=vertical)]
    signal input board_state[100]; // Private: Claimed board state to verify against ships
    signal input salt; // Private: Blinding factor for the merkle tree

    signal input commitment; // Public: Poseidon Commitment 
    signal input merkle_root; // Public: Meerkle root of board state

    var ship_sizes[5] = [3, 3, 2, 2, 2];

    // Validate input board_state is either 0 or 1.
    for (var i = 0; i < 100; i++) {
        board_state[i] * (board_state[i] - 1) === 0;
    }

    // Initialize the board
    signal expected_board[100];

    // Declare all components and signals
    component x_checks[5];
    component y_checks[5];
    component bounds_checks[5];
    signal ship_occupancy[100][5];  // [cell_index][ship_index]
    component occupied_checks[100][5];  // [cell_index][ship_index]

        // Validate All ship properties.
    for (var s = 0; s < 5; s++) {
        // Check coordinates and orientation
        x_checks[s] = RangeCheck(10);
        x_checks[s].in <== ships[s][0];

        y_checks[s] = RangeCheck(10);
        y_checks[s].in <== ships[s][1];

        // Validate ship length matches expected size
        ships[s][2] === ship_sizes[s];
        
        // Validate orientation is 0 or 1
        ships[s][3] * (ships[s][3] - 1) === 0;

        // Validate the ship doesn't extend beyond the board.
        bounds_checks[s] = ValidateShipBounds();
        bounds_checks[s].ship_start_x <== ships[s][0];
        bounds_checks[s].ship_start_y <== ships[s][1];
        bounds_checks[s].ship_length <== ships[s][2];
        bounds_checks[s].ship_orientation <== ships[s][3];
        bounds_checks[s].valid === 1;
    }

    log("bounds_checks completed");

     // Compute Board state.
    for (var i = 0; i < 100; i++) {
        // Convert 1D index to 2D coordinates
        var cell_x = i \ 10; 
        var cell_y = i % 10;

        for (var s = 0; s < 5; s++) {
            occupied_checks[i][s] = CellOccupied();
            occupied_checks[i][s].cell_x <== cell_x;
            occupied_checks[i][s].cell_y <== cell_y;
            occupied_checks[i][s].ship_start_x <== ships[s][0];
            occupied_checks[i][s].ship_start_y <== ships[s][1];
            occupied_checks[i][s].ship_length <== ship_sizes[s];
            occupied_checks[i][s].ship_orientation <== ships[s][3];
            ship_occupancy[i][s] <== occupied_checks[i][s].occupied;
        }

        // Sum occupancy from all ships
        expected_board[i] <== ship_occupancy[i][0] + ship_occupancy[i][1] + ship_occupancy[i][2] + ship_occupancy[i][3] + ship_occupancy[i][4];

        // Ensure no overlaps in expected_board. Each should either be 0 or 1.
        expected_board[i] * (expected_board[i] - 1) === 0;
        
        // Verify claimed board_state matches expected board generated from ships
        board_state[i] === expected_board[i];
    }

    log("expected_board completed");

    // Verify Merkle root
    component merkle = MerkleTreeRoot(7); // log2(100) ~ 7
    for (var i = 0; i < 100; i++) {
        merkle.leaves[i] <== board_state[i];
    }
     // Pad remaining leaves with zeros
    for (var i = 100; i < 128; i++) {
        merkle.leaves[i] <== 0;
    }
    log("merkle tree checking...");
    log("merkle.root", merkle.root);
    merkle.root === merkle_root;

    log("merkle tree completed");

    log("Poseidon Boarding commitmentstarting...");

   
    component commitment_hash = Poseidon(2);
    commitment_hash.inputs[0] <== merkle.root;
    commitment_hash.inputs[1] <== salt;
    log("commitment_hash.out", commitment_hash.out);
    commitment === commitment_hash.out; // Merkle root of 100 board cells + 1 salt

    log("Poseidon Boarding commitment completed");
}

component main {public [commitment, merkle_root]} = ShipPlacement();