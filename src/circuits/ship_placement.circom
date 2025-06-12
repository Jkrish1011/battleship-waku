include "circomlib/pedersen.circom";
include "circomlib/merkletree.circom";

template LessThan(n) {
    // To check if the input is less than 254 since circom is on BN254 curve.
    assert(n <= 252);
    signal input in[2];
    signal output out;
    // Convert the input to binary representation.
    component lt = Num2Bits(n);
    /*
        We are using the following mathematical property:

        If a + 2^n - b < 2^n, then a < b
        If a + 2^n - b >= 2^n, then a >= b

        The nth bit tells us everything:

        If bit n is 0: the number is less than 2^n, so a < b
        If bit n is 1: the number is 2^n or greater, so a ≥ b

        Let's say n = 4, so we're working with 4-bit numbers (0-15).
        2^n = 2^4 = 16

        Example 1: in[0] = 3, in[1] = 7 (checking if 3 < 7)
        Step 1: Calculate the input to Num2Bits
        lt.in <== in[0] + (1<<n) - in[1]
        lt.in <== 3 + 16 - 7 = 12

        Step 2: Convert 12 to binary using Num2Bits(4)
        12 in binary = 01100 (0th index starts from the right most bit)
        So the outputs are:

        lt.out[0] = 0 (bit 0)
        lt.out[1] = 0 (bit 1)
        lt.out[2] = 1 (bit 2)
        lt.out[3] = 1 (bit 3)
        lt.out[4] = 0 (bit 4) ← This is the key bit!
    */
    lt.in <== in[0] + (1<<n) - in[1];
    /*
        We want output 1 when a < b (bit n = 0)
        We want output 0 when a >= b (bit n = 1)
    */
    out <== 1 - lt.out[n];
}

template LessEqThan(n) {
    signal input in[2];

    signal output out;
    component lt = LessThan(n);
    lt.in[0] <== in[0];
    lt.in[1] <== in[1] + 1;
    out <== lt.out;
}

template RangeCheck(n) {
  signal input in;
  signal output out;
  out <== in;
  assert(in >= 0 && in < n);
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

template IsZero() {
    signal input in;
    // 1 if input is zero, 0 otherwise
    signal output out;

    signal inv;
    // Calculating the multiplicative inverse of in.
    // If in != 0: out = -in × (1/in) + 1 = -1 + 1 = 0
    // If in = 0: out = -0 × 0 + 1 = 1

    inv <-- in != 0? 1/in : 0; 
    out <== -in * inv + 1;

    // This constraint prevents malicious provers from providing invalid witness values that would break the zero-check logic.
    in * out === 0;
}

template IsEqual() {
    signal input in[2];
    signal output out;

    component isz = IsZero();
    isz.in <== in[1] - in[0];
    out <== isz.out;
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
    signal input salt; // Private: Blinding factor for the merkle tree

    signal input commitment; // Public: Pedersen Commitment 
    signal input merkle_root; // Public: Meerkle root of board state

    // Ship Sizes: [3, 3, 2, 2, 2]
    var ship_sizes[5] = [3, 3, 2, 2, 2];

    // Initialize the board
    signal board[100];

    // Validate All ship properties.
    for (var s = 0; s < 5; s++) {
        // check coordinates and orientation
        component x_check = RangeCheck(10);
        x_check.in <== ships[s][0];

        component y_check = RangeCheck(10);
        y_check.in <== ships[s][1];

        ships[s][2] === ship_sizes[s];
        ships[s][3] * (ships[s][3] - 1) === 0;  // Orientation is 0 or 1

        // Validate the ship doesn't extend beyond the board.
        component bounds_check = ValidateShipBounds();
        bounds_check.ship_start_x <== ships[s][0];
        bounds_check.ship_start_y <== ships[s][1];
        bounds_check.ship_length <== ships[s][2];
        bounds_check.ship_orientation <== ships[s][3];
        bounds_check.valid === 1;
    }

    // Compute Board state.

    for (var i = 0; i < 100; i++) {
        // convert 1D index to 2D coordinates
        var cell_x = i \ 10; 
        var cell_y = i % 10;

        signal ship_occupancy[5];

        for (var s = 0; s < 5; s++) {
            component occupied = CellOccupied();
            occupied.cell_x <== cell_x;
            occupied.cell_y <== cell_y;
            occupied.ship_start_x <== ships[s][0];
            occupied.ship_start_y <== ships[s][1];
            occupied.ship_length <== ship_sizes[s];
            occupied.ship_orientation <== ships[s][3];
            ship_occupancy[s] <== occupied.occupied;
        }

        // Sum occupancy from all ships
        board[i] <== ship_occupancy[0] + ship_occupancy[1] + ship_occupancy[2] + ship_occupancy[3] + ship_occupancy[4];
        
        // Ensure no overlaps (each cell should be 0 or 1)
        board[i] * (board[i] - 1) === 0;
    }

    // Verify Merkle root
    component merkle = MerkleTreeChecker(7); // log2(100) ~ 7
    for (var i = 0; i < 100; i++) {
        merkle.leaves[i] <== board[i];
    }
     // Pad remaining leaves with zeros
    for (var i = 100; i < 128; i++) {
        merkle.leaves[i] <== 0;
    }
    merkle.root === merkle_root;

    // Verify Commitment
    component pedersen = Pedersen(21); // 5 * 4 + 1 
    var idx = 0;
    for (var s = 0; s < 5; s++) {
        for (var i = 0; i < 4; i++) {
            pedersen.in[idx] <== ships[s][i];
            idx++;
        }
    }
    pedersen.in[idx] <== salt;
    commitment === pedersen.out[0];
}

component main = ShipPlacement();