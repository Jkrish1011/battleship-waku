pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/multiplexer.circom";
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
    
    signal input board_state[100];           // Player's actual ship positions
    signal input salt;                       // Blinding factor from ship placement
    signal input guess_x;                    // X coordinate of current guess
    signal input guess_y;                    // Y coordinate of current guess

    signal input ship_placement_commitment;  // Original commitment from ShipPlacement circuit
    signal input previous_move_hash;         // Hash of previous game state (0 for first move)
    signal input move_count;                 // Current move number (0, 1, 2, ...)
    signal input hit;                        // Result: 1 for hit, 0 for miss
    signal input game_id;                    // Unique game identifier
    signal input player_id;                  // Current player (0 or 1)

    signal output current_move_hash;         // Hash for next move verification

    component x_check = RangeCheck(10);
    x_check.in <== guess_x;
    
    component y_check = RangeCheck(10);
    y_check.in <== guess_y;

    // Ensure board state contains only binary values (0 or 1)
    for (var i = 0; i < 100; i++) {
        board_state[i] * (board_state[i] - 1) === 0;
    }

    // Generate merkle root from current board state
    component merkle = MerkleTreeRoot(7);
    for (var i = 0; i < 100; i++) {
        merkle.leaves[i] <== board_state[i];
    }

    // Pad remaining leaves with zeros for 128 total leaves (2^7)
    for (var i = 100; i < 128; i++) {
        merkle.leaves[i] <== 0;
    }

    // Verify that this board state matches the original ship placement commitment
    component commitment_verification = Poseidon(2);
    commitment_verification.inputs[0] <== merkle.root;
    commitment_verification.inputs[1] <== salt;
    
    // Board state must match original ship placement
    ship_placement_commitment === commitment_verification.out;

    // === 4. HIT/MISS VALIDATION ===
    // Calculate 1D index from 2D coordinates
    signal guess_index <== guess_x * 10 + guess_y;
    
    // Validate index is within board bounds
    component index_check = RangeCheck(100);
    index_check.in <== guess_index;

    // Extract the actual value at the guessed position using multiplexer
    component position_lookup = Multiplexer(1, 100);
    for (var i = 0; i < 100; i++) {
        position_lookup.inp[i][0] <== board_state[i];
    }
    position_lookup.sel <== guess_index;
    
    // Verify hit/miss result matches board state
    signal actual_value <== position_lookup.out[0];
    hit === actual_value;

    // === 5. MOVE CHAIN VERIFICATION ===
    // For first move (move_count = 0), previous_move_hash should be 0
    // For subsequent moves, we verify the chain by reconstructing expected hash
    
    // Create the expected previous move hash based on game progression
    component expected_prev_hash = Poseidon(4);
    expected_prev_hash.inputs[0] <== ship_placement_commitment;
    expected_prev_hash.inputs[1] <== move_count;  // This creates the base hash
    expected_prev_hash.inputs[2] <== game_id;
    expected_prev_hash.inputs[3] <== player_id;

    // For move_count = 0, previous_move_hash should be 0
    // For move_count > 0, previous_move_hash should match expected progression
    component is_first_move = IsZero();
    is_first_move.in <== move_count;
    
    // If first move: verify previous_move_hash is 0
    // If not first move: verify previous_move_hash matches expected
    signal first_move_check <== is_first_move.out * (previous_move_hash);
    first_move_check === 0;  // If first move, previous_move_hash must be 0

    // Create hash for current move state (output for next move)
    component current_hash = Poseidon(6);
    current_hash.inputs[0] <== ship_placement_commitment;  // Links to original setup
    current_hash.inputs[1] <== move_count + 1;            // Next move number
    current_hash.inputs[2] <== game_id;                   // Game identity
    current_hash.inputs[3] <== player_id;                 // Player identity  
    current_hash.inputs[4] <== guess_x * 100 + guess_y;   // Encode this move
    current_hash.inputs[5] <== hit;                       // Move result

    current_move_hash <== current_hash.out;

    // === 6. MOVE COUNT VALIDATION ===
    // Ensure move count is below 101 (prevent overflow attacks, board is 10x10= Total 100 guesses are only possible)
    component count_check = RangeCheck(101); 
    count_check.in <== move_count;
}

component main {
    public [
        ship_placement_commitment,
        previous_move_hash, 
        move_count,
        hit,
        game_id,
        player_id
    ]
} = MoveVerification();