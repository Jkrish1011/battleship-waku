const crypto = require("crypto");

function generateCorrectInput() {
    const ships = [
        [1, 1, 3, 0], // Ship 1: horizontal 3-length at (1,1)
        [3, 2, 3, 1], // Ship 2: vertical 3-length at (3,2) 
        [5, 5, 2, 0], // Ship 3: horizontal 2-length at (5,5)
        [7, 2, 2, 1], // Ship 4: vertical 2-length at (7,2)
        [0, 8, 2, 0]  // Ship 5: horizontal 2-length at (0,8)
    ];

    let boardState = Array(100).fill(0);
    const shipSizes = [3, 3, 2, 2, 2];

    console.log("Generating board state from ship placements...\n");

    ships.forEach((ship, shipIndex) => {
        const [x, y, length, orientation] = ship;
        console.log(`Ship ${shipIndex + 1}: [${x}, ${y}, ${length}, ${orientation}]`);
        
        let positions = [];

        for (let i = 0; i < length; i++) {
            const cellX = x + ((1 - orientation) * i);
            const cellY = y + (orientation * i);
            const cellIndex = cellX * 10 + cellY;

            if (cellIndex >= 0 && cellIndex < 100) {
                boardState[cellIndex] = 1;
                positions.push(`(${cellX}, ${cellY})`);
            }
        }
        console.log(` Positions: ${positions.join(", ")}`);
    });

    console.log("\n Generated Board state");
    console.log(`const boardState = [`);
    for (let row = 0; row < 10; row++) {
        const rowData = boardState.slice(row * 10, (row + 1) * 10);
        console.log(`  ${rowData.join(',')}, // Row ${row}`);
    }
    console.log("];");

    console.log("\nBoard visualization:");
    for (let row = 0; row < 10; row++) {
        let rowStr = `${row}: `;
        for (let col = 0; col < 10; col++) {
            const index = row * 10 + col;
            rowStr += boardState[index] === 1 ? '■' : '·';
        }
        console.log(rowStr);
    }

    const totalShips = boardState.reduce((sum, cell) => sum + cell, 0);
    const expectedTotal = shipSizes.reduce((sum, size) => sum + size, 0);

    console.log(`\nTotal ships: ${totalShips}, Expected: ${expectedTotal}`);

    // Generate complete input object
    const salt = "123456789";
    
    const input = {
        ships: ships,
        board_state: boardState,
        salt: salt,
        commitment: "0", 
        merkle_root: "0" 
    };
    
    console.log("\nComplete input object:");
    console.log(JSON.stringify(input, null, 2));
    
    return input;
}

function validateInput(ships, boardState) {
    console.log("Validating input...");

    let expectedBoard = Array(100).fill(0);
    let shipSizes = [3, 3, 2, 2, 2];

    const issues = [];

    ships.forEach((ship, shipIndex) => {
        const [x, y, length, orientation] = ship;

        if (x < 0 || x > 9 || y < 0 || y > 9) {
            issues.push(`Ship ${shipIndex + 1} is out of bounds: (${x}, ${y})`);
        }

        if (length !== shipSizes[shipIndex]) {
            issues.push(`Ship ${shipIndex + 1} has incorrect length: ${length} (expected ${shipSizes[shipIndex]})`);
        }

        if (orientation !== 0 && orientation !== 1) {
            issues.push(`Ship ${shipIndex + 1} has invalid orientation: ${orientation} (expected 0 or 1)`);
        }

        // Calculate End Positions.
        const endX = x + (1- orientation) * (length - 1);
        const endY = y + orientation * (length - 1);

        if (endX > 9 || endY > 9 ) {
            issues.push(`Ship ${shipIndex + 1} extends beyond the board: (${endX}, ${endY})`);
        }

        // Check if the ship overlaps with other ships.
        for (let i = 0; i < length; i++) {
            const cellX = x + ((1 - orientation) * i);
            const cellY = y + (orientation * i);
            const cellIndex = cellX * 10 + cellY;

            if (cellIndex >= 0 && cellIndex < 100) {
                if (expectedBoard[cellIndex] === 1) {
                    issues.push(`Ship ${shipIndex + 1} overlaps with another ship at (${cellX}, ${cellY})`);
                }
                expectedBoard[cellIndex] = 1;
            }
        }
    });
    // Compare expectedBoard with boardState
    let mismatches = 0;
    for (let i = 0; i < 100; i++) {
        if (expectedBoard[i] !== boardState[i]) {
            mismatches++;
            const x = Math.floor(i / 10);
            const y = i % 10;
            issues.push(`Mismatch at (${x}, ${y}): expected ${expectedBoard[i]}, got ${boardState[i]}`);
        }
    }

    if (issues.length > 0) {
        console.log("\nValidation issues:");
        issues.forEach((issue) => console.log(`- ${issue}`));
    } else {
        console.log("\nValidation successful!");
    }
}


if (require.main === module) {
    console.log("Running input generator...");

    const correctInput = generateCorrectInput();

    console.log("\n" + "=".repeat(50));

    const yourShips = [
        [1, 1, 3, 0],
        [3, 2, 3, 1], 
        [5, 5, 2, 0],
        [7, 2, 2, 1],
        [0, 8, 2, 0]
    ];
    
    const yourBoardState = [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        1,
        1,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ];
    
    console.log("\nValidating your original input:");
    validateInput(yourShips, yourBoardState);
}


module.exports = {
    generateCorrectInput,
};