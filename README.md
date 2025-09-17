# 🚢 Zero Knowledge Battleship Game

[![Next.js](https://img.shields.io/badge/Next.js-14.1.2-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Waku Protocol](https://img.shields.io/badge/Waku-Protocol-blue?style=flat-square)](https://waku.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Circom](https://img.shields.io/badge/Circom-ZK--SNARKs-green?style=flat-square)](https://circom.io/)

A decentralized, privacy-preserving Battleship game that combines the power of **Waku Protocol** for peer-to-peer communication with **Zero-Knowledge SNARKs** for cryptographic proof verification. Players can engage in trustless gameplay without revealing their ship positions until the game concludes.

## ✨ Features

- 🔐 **Zero-Knowledge Proofs**: Ship placements and moves are verified using zk-SNARKs without revealing sensitive information
- 🌐 **Decentralized Communication**: Built on Waku Protocol for censorship-resistant, peer-to-peer messaging
- 🎮 **Classic Battleship Gameplay**: Traditional 10x10 grid with standard ship placement rules
- 🚀 **Modern Web Interface**: Built with Next.js, TypeScript, and Tailwind CSS
- 🔒 **Privacy-First**: Your ship positions remain private throughout the game
- ⚡ **Real-time Updates**: Instant game state synchronization between players

## 🏗️ Architecture

This project consists of three main components:

1. **Frontend Application** (`/src`): Next.js-based web interface
2. **Circom Circuits** (`/circuits` & `/circuits2`): Zero-knowledge proof circuits for game logic verification (legacy and state channel based circuits)
3. **Waku Integration**: Decentralized messaging layer for player communication

## 🛠️ Technology Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Zero-Knowledge**: Circom, SnarkJS, Groth16 proving system
- **P2P Communication**: Waku Protocol SDK
- **Cryptography**: libp2p, ethers.js
- **State Management**: Zustand

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ (check with `node --version`)
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd battleship-waku
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Compile the Circom circuits**
   ```bash
   cd circuits2
   npm install
   # Compile all circuits
   npm run circuit:compile
   # Generate trusted setup (this may take several minutes)
   npm run circuit:setup
   # Generate proving and verification keys
   npm run circuit:keys
   ```

4. **Copy circuit artifacts to public folder**
   ```bash
   # Copy the generated WASM files and zkey files
   cp circuits2/build/ship_placement/ship_placement_js/* public/shipPlacement/
   cp circuits2/build/move_verification/move_verification_js/* public/moveVerification/
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   
   Navigate to [http://localhost:3001](http://localhost:3001) to start playing!

## 🎮 How to Play

1. **Setup Phase**: Place your ships on the 10x10 grid
2. **Commitment Phase**: Generate a cryptographic commitment of your board layout
3. **Battle Phase**: Take turns guessing opponent's ship positions
4. **Verification Phase**: Each move is verified using zero-knowledge proofs
5. **Victory**: First player to sink all opponent ships wins!

## 📁 Project Structure

```
battleship-waku/
├── src/                    # Next.js application source
│   ├── components/         # React components
│   ├── pages/             # Next.js pages
│   ├── hooks/             # Custom React hooks
│   └── utils/             # Utility functions
├── circuits/              # Legacy Circom circuits without state channel
├── circuits2/             # Current Circom circuits with state channel
│   ├── circuits/          # Circuit definitions
│   ├── build/             # Compiled circuits
│   └── keys/              # Proving/verification keys
├── public/                # Static assets and circuit artifacts
└── docs/                  # Documentation
```

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server on port 3001
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### State Channel Circuit Development

Navigate to the `circuits2` directory for state channel based circuit-related commands:

- `npm run circuit:compile` - Compile all Circom circuits
- `npm run circuit:setup` - Generate trusted setup
- `npm run circuit:keys` - Generate proving and verification keys
- `npm run circuit:test` - Test circuit functionality

## 🤝 Contributing

We welcome contributions! 

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Waku Protocol](https://waku.org/) for decentralized messaging infrastructure
- [Circom](https://circom.io/) for zero-knowledge circuit development
- [SnarkJS](https://github.com/iden3/snarkjs) for proof generation and verification

## 📞 Support

If you encounter any issues or have questions:

- Open an issue on GitHub
- connect with me on tg: @jk_it_is

---

**Ready to play? Deploy your fleet and engage in cryptographically secure naval warfare! ⚓**
