const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const circuitsDir = path.join(__dirname, '../circuits');
const artifactsDir = path.join(circuitsDir, 'artifacts');

// Create artifacts directory if it doesn't exist
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

// Get all .circom files in the circuits directory
const circuitFiles = fs.readdirSync(circuitsDir)
  .filter(file => file.endsWith('.circom'));

if (circuitFiles.length === 0) {
  console.log('No circuit files found in circuits directory');
  process.exit(0);
}

console.log(`Found ${circuitFiles.length} circuit files to compile:`);

// Compile each circuit
circuitFiles.forEach(circuitFile => {
  const circuitName = circuitFile.replace('.circom', '');
  const outputPath = path.join(artifactsDir, circuitName);
  
  console.log(`\nCompiling ${circuitFile}...`);
  
  try {
    execSync(`circom ${path.join(circuitsDir, circuitFile)} --r1cs --wasm --sym --c -o ${outputPath}`, {
      stdio: 'inherit'
    });
    console.log(`Successfully compiled ${circuitFile}`);
  } catch (error) {
    console.error(`Failed to compile ${circuitFile}:`, error.message);
    process.exit(1);
  }
});

console.log('\nAll circuits compiled successfully!');