# Zero Knowledge Battle Ship Game powered by Waku Protocol

This Battleship game communicates over the Waku protocol. Each player’s move and the board state are presented and verified using zk-SNARKs implemented in Circom circuits.

## Getting Started

First, make sure compile the circuits which are present in the /circuits2.
Secondly, once the wasm files are generated, place the shipplacement and moveVerification in the public folder of the next application
Third, run the next application using the below commands.

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser to play the game.
