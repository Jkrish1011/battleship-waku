# Battleship circuits

#### Compilation steps

With optimization.
```
circom battleship.circom --r1cs --wasm --sym --c
```

#### Setup ceremony (for production):

```
# Download powers of tau
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau

# Generate zkey
snarkjs groth16 setup battleship.r1cs powersOfTau28_hez_final_15.ptau battleship_0000.zkey

# Contribute to ceremony (optional but recommended)
snarkjs zkey contribute battleship_0000.zkey battleship_final.zkey

# Export verification key
snarkjs zkey export verificationkey battleship_final.zkey verification_key.json
```