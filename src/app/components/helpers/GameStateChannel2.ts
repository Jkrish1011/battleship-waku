import { ethers } from 'ethers';
import crypto from "crypto";

import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";

// interface ShipPlacementCommitment {
//     commitment: string; // bytes 32
// }

interface ZKProofData {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
}

interface ZKCalldataProof {
    pA: string[];
    pB: string[][];
    pC: string[];
    pubSignals: string[];
}

interface ZKProofPublicData {
    publicSignals: string[];
}

interface StateChannelMessage {
    type: 'STATE_UPDATE' | 'MOVE' | 'WIN_CLAIM' | 'DISPUTE' | 'SYNC_REQUEST';
    gameId: string;
    nonce: number;
    data: any;
    signature: string;
    timestamp: number;
}

interface Move {
    x: number;
    y: number;
    isHit: boolean;
    timestamp: number;
}

interface SignatureResponse {
    message: string;
    signature: string;
    address: string;
}

interface GameState {
    gameId: string;
    wakuRoomId: string;
    player1: string;
    player2: string;
    isActive: boolean;
    playerTurn: string;
    player1BoardCommitment: string | null;
    player2BoardCommitment: string | null;
    player1MerkleRoot: string;
    player2MerkleRoot: string;
    player1ShipPlacementProof: ZKCalldataProof | null;
    player2ShipPlacementProof: ZKCalldataProof | null;
    player1Hits: number;
    player2Hits: number;
    nonce: number;
    lastMove: {
        player: string;
        moveProof: ZKCalldataProof | null;
        moveProofPublicData: ZKProofPublicData | null;
        isHit: boolean;
        move: Move;
    } | null;
    winner: string | null;
    moves: Move[];
    signatures: {
        player1: string | null;
        player2: string | null;
    }
}

interface WinProof {
    pA: string[];
    pB: string[][];
    pC: string[];
    pubSignals: string[];
}

class GameStateChannelError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "GameStateChannelError";
    }
}

class InvalidMoveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidMoveError";
    }
}

class InvalidSignatureError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidSignatureError";
    }
}

export class GameStateChannel {
    private gameState: GameState | null = null;
    private signer: ethers.Signer | null = null;
    private eventListeners: Map<string, Function[]> = new Map();
    private syncInProgress: boolean = false;
    private poseidon: any;
    private levels: number;
    private shipSizes: number[];

    constructor(wakuRoomId: string, signer: ethers.Signer) {
        this.gameState = {
            gameId: "",
            wakuRoomId: wakuRoomId,
            player1: "",
            player2: "",
            isActive: false,
            playerTurn: "",
            player1BoardCommitment: null,
            player2BoardCommitment: null,
            player1MerkleRoot: "",
            player2MerkleRoot: "",
            player1ShipPlacementProof: null,
            player2ShipPlacementProof: null,
            player1Hits: 0,
            player2Hits: 0,
            nonce: 0,
            lastMove: null,
            winner: null,
            moves: [],
            signatures: {
                player1: null,
                player2: null
            }
        };
        this.signer = signer;
        this.poseidon = null;
        this.levels = 7;
        this.shipSizes = [3, 3, 2, 2, 2];
    }

    on(event: string, callback: Function) : void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)?.push(callback);
    }

    off(event: string, callback: Function) : void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    private emit(event: string, data: any): void {
        const listeners = this.eventListeners.get(event) || [];
        listeners.forEach(callback => callback(data));
    }

    private hashMoves(): string {
        if (!this.gameState || this.gameState.moves.length === 0) {
            return ethers.ZeroHash;
        }

        // creating a hash of all moves
        const movesData = this.gameState.moves.map(move => ({
            x: move.x,
            y: move.y,
            isHit: move.isHit,
            timestamp: move.timestamp
        }));

        movesData.sort((a, b) => a.timestamp - b.timestamp);
        const types = ['uint8', 'uint8', 'bool', 'uint256'];
        let combinedHash = ethers.ZeroHash;

        for(const move of movesData) {
            const values = [move.x, move.y, move.isHit, move.timestamp];
            const moveHash = ethers.solidityPackedKeccak256(types, values);

            combinedHash = ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [combinedHash, moveHash]);
        }

        return combinedHash;
    }

    static createShipPlacementCommitment(
        boardData: number[][],
        salt: string
    ): string {
        
        const flatBoard = boardData.flat();

        const commitment = ethers.solidityPackedKeccak256(
            ['uint8[100]', 'bytes32'], 
            [ flatBoard, ethers.keccak256(ethers.toUtf8Bytes(salt)) ]
        );
        return commitment;
    }

    // Helper method to verify commitment matches board data
    static verifyShipPlacementCommitment(
        commitment: string,
        boardData: number[][],
        salt: string
    ): boolean {
        const expectedCommitment = GameStateChannel.createShipPlacementCommitment(boardData, salt);
        return commitment === expectedCommitment;
    }

    private computeStateHash(): string {
        if(!this.gameState) {
            throw new GameStateChannelError("Game state not initialized");
        }    

        const types = [
            'uint256',  // gameId
            'uint256',  // nonce
            'address',  // player1
            'address',  // player2
            'bool',     // isActive
            'address',  // playerTurn
            'uint8',    // player1Hits
            'uint8',    // player2Hits
            'bytes32',  // movesHash (hash of all moves)
            'address'   // winner (address(0) if no winner)
        ];

        const values = [
            this.gameState.gameId,
            this.gameState.nonce,
            this.gameState.player1 || ethers.ZeroAddress,
            this.gameState.player2 || ethers.ZeroAddress,
            this.gameState.isActive,
            this.gameState.playerTurn || ethers.ZeroAddress,
            this.gameState.player1Hits,
            this.gameState.player2Hits,
            this.hashMoves(),
            this.gameState.winner || ethers.ZeroAddress
        ];
        console.log("values", values);

        return ethers.solidityPackedKeccak256(types, values);
    }

    async updateSignatures(signerAddress: string, signature: string) {
        if (!this.signer || !this.gameState) {
            return;
        }
        
        if(signerAddress === this.gameState.player1) {
            this.gameState.signatures.player1 = signature;
        } else if(signerAddress === this.gameState.player2) {
            this.gameState.signatures.player2 = signature;
        }
    }

    private async signGameState(): Promise<void> {
        if (!this.signer || !this.gameState) {
            return;
        }
        const stateHash = this.computeStateHash();
        const messageHash = ethers.hashMessage(ethers.getBytes(stateHash));
        const signature = await this.signer.signMessage(ethers.getBytes(messageHash));

        const signerAddress = await this.signer.getAddress();
        if(signerAddress === this.gameState.player1) {
            this.gameState.signatures.player1 = signature;
        } else if(signerAddress === this.gameState.player2) {
            this.gameState.signatures.player2 = signature;
        }
    }

    // Helper method to convert BigInt to bytes32 (matching Solidity bytes32() conversion)
    bigIntToBytes32(value: BigInt | string): string {
        // Convert to BigInt if string
        const bigIntValue = typeof value === 'string' ? BigInt(value) : value;
        
        // Convert to hex string and pad to 32 bytes (64 hex characters)
        return ethers.zeroPadValue(ethers.toBeHex(bigIntValue), 32);
    }

    // Helper method to convert bytes32 back to BigInt
    static bytes32ToBigInt(bytes32: string): BigInt {
        return BigInt(bytes32);
    }

    private validateMoveProof(
        moveProof: ZKCalldataProof, 
        moveProofPublicData: ZKProofPublicData, 
        move: Move
    ): boolean {
        // Implement move proof validation logic with ZK.
        return true;
    }

    async declareWinner(
        winner: string,
        winProof?: WinProof
    ): Promise<void> {
        if (!this.gameState) {
            throw new GameStateChannelError("Game state not initialized");
        }

        if (this.gameState.winner) {
            throw new GameStateChannelError("Winner already declared");
        }

         // Validate winner
         if (winner !== this.gameState.player1 && winner !== this.gameState.player2) {
            throw new GameStateChannelError("Invalid winner");
        }

        // validate hits
        const winnerHits = winner === this.gameState.player1 ? this.gameState.player1Hits : this.gameState.player2Hits;
        if (winnerHits < 17) {
            throw new GameStateChannelError("Winner has not hit enough ships");
        }

        this.gameState.winner = winner;
        this.gameState.isActive = false;
        this.gameState.nonce++;

        await this.signGameState();
        this.emit('gameEnded', { winner, gameState: this.gameState });
    }

    private computeMessageHash(message: StateChannelMessage): string {
        const types = [
            'string',   // type
            'uint256',  // gameId
            'uint256',  // nonce
            'bytes32',  // dataHash
            'uint256'   // timestamp
        ];

        const values = [
            message.type,
            message.gameId,
            message.nonce,
            ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(message.data))),
            message.timestamp
        ];

        return ethers.solidityPackedKeccak256(types, values);
    }

    private async verifyMessageSignature(message: StateChannelMessage): Promise<boolean> {
        if (!message.signature) {
            return false;
        }

        try {
            const messageHash = this.computeMessageHash(message);
            const recoveredAddress = ethers.verifyMessage(ethers.getBytes(messageHash), message.signature);
            
            // Check if recovered address is one of the players
            return recoveredAddress === this.gameState?.player1 || 
                   recoveredAddress === this.gameState?.player2;
        } catch (error) {
            return false;
        }
    }


    async verifySignature(
        signature: string,
        player: string
    ): Promise<boolean> {
        if(!this.gameState) {
            return false;
        }

        try{
            const stateHash = this.computeStateHash();
            const recoveredAddress = ethers.verifyMessage(ethers.getBytes(stateHash), signature);
            return recoveredAddress.toLowerCase() === player.toLowerCase();
        }catch(error){
            return false;
        }
    }

    // State synchronization
    async synchronizeState(peerState: GameState): Promise<void> {
        if (!this.gameState) {
            throw new GameStateChannelError("Game state not initialized");
        }

        if (this.syncInProgress) {
            return;
        }

        this.syncInProgress = true;

        try {
            // Compare nonces to determine which state is newer
            if (peerState.nonce > this.gameState.nonce) {
                // Validate peer state signatures
                const player1Valid = peerState.signatures.player1 ? 
                    await this.verifySignature(peerState.signatures.player1, peerState.player1) : true;
                const player2Valid = peerState.signatures.player2 ? 
                    await this.verifySignature(peerState.signatures.player2, peerState.player2) : true;

                if (player1Valid && player2Valid) {
                    this.gameState = { ...peerState };
                    this.emit('stateSynchronized', this.gameState);
                } else {
                    throw new InvalidSignatureError("Invalid peer state signatures");
                }
            }
        } finally {
            this.syncInProgress = false;
        }
    }

    async signCustomMessage(message: string) : Promise<SignatureResponse> {
        try{
            if (!this.signer) {
                throw new GameStateChannelError("Signer not available");
            }
    
            const signature = await this.signer.signMessage(message);
            const address = await this.signer.getAddress();
    
            return {
                message,
                signature,
                address
            };
        }catch(err) {
            console.error("Error signing message:", err);
            throw err;
        }
    }

    async verifyCustomMessage(message: SignatureResponse) : Promise<boolean> {
        try{
            const recoveredAddress = ethers.verifyMessage(message.message, message.signature);
            return recoveredAddress.toLowerCase() === message.address.toLowerCase();
        }catch(error){
            return false;
        }
    }

    // Message signing and verification - Solidity compatible
    async signMessage(message: StateChannelMessage): Promise<StateChannelMessage> {
        if (!this.signer) {
            throw new GameStateChannelError("Signer not available");
        }

        const messageHash = this.computeMessageHash(message);
        const signature = await this.signer.signMessage(ethers.getBytes(messageHash));
        
        return {
            ...message,
            signature
        };
    }

    // Message handling
    async createMessage(type: StateChannelMessage['type'], data: any): Promise<StateChannelMessage> {
        if (!this.gameState) {
            throw new GameStateChannelError("Game state not initialized");
        }

        const message: StateChannelMessage = {
            type,
            gameId: this.gameState.gameId,
            nonce: this.gameState.nonce,
            data,
            signature: '', // Will be filled when signing
            timestamp: Date.now()
        };

        // Sign the message
        return await this.signMessage(message);
    }

    private async handleMoveMessage(message: StateChannelMessage): Promise<void> {
        const { player, move, moveProof, moveProofPublicData } = message.data;
        await this.makeMove(player, move, moveProof, moveProofPublicData);
    }

    private async handleWinClaimMessage(message: StateChannelMessage): Promise<void> {
        const { winner, winProof } = message.data;
        await this.declareWinner(winner, winProof);
    }

    private async handleDisputeMessage(message: StateChannelMessage): Promise<void> {
        // Handle dispute resolution
        this.emit('dispute', message.data);
    }

    private async handleSyncRequestMessage(message: StateChannelMessage): Promise<void> {
        // Send current state to requester
        this.emit('syncRequested', this.gameState);
    }

    async processMessage(message: StateChannelMessage): Promise<void> {
        // Validate message signature
        if (!await this.verifyMessageSignature(message)) {
            throw new InvalidSignatureError("Invalid message signature");
        }

        switch (message.type) {
            case 'STATE_UPDATE':
                await this.synchronizeState(message.data);
                break;
            case 'MOVE':
                await this.handleMoveMessage(message);
                break;
            case 'WIN_CLAIM':
                await this.handleWinClaimMessage(message);
                break;
            case 'DISPUTE':
                await this.handleDisputeMessage(message);
                break;
            case 'SYNC_REQUEST':
                await this.handleSyncRequestMessage(message);
                break;
        }
    }

    // Utility methods
    getGameState(): GameState | null {
        return this.gameState;
    }

    getGameId(): string {
        return this.gameState?.gameId || '';
    }

    isPlayerTurn(player: string): boolean {
        return this.gameState?.playerTurn === player;
    }

    getOpponent(player: string): string {
        if (!this.gameState) {
            return '';
        }
        return player === this.gameState.player1 ? this.gameState.player2 : this.gameState.player1;
    }

    exportState(): string {
        return JSON.stringify(this.gameState);
    }

    importState(stateJson: string): void {
        this.gameState = JSON.parse(stateJson);
        this.emit('stateImported', this.gameState);
    }

    // Dispute resolution
    async initiateDispute(reason: string, evidence: any): Promise<void> {
        if (!this.gameState) {
            throw new GameStateChannelError("Game state not initialized");
        }

        const disputeData = {
            gameId: this.gameState.gameId,
            reason,
            evidence,
            timestamp: Date.now(),
            gameState: this.gameState
        };

        this.emit('disputeInitiated', disputeData);
    }

    // Cleanup
    destroy(): void {
        this.eventListeners.clear();
        this.gameState = null;
        this.signer = null;
    }

    async initialize() {
        this.poseidon = await buildPoseidon();
        this.levels = 7;
    }

    generateSalt() {
        const randomBytes = crypto.randomBytes(32);
        const saltBigInt = BigInt(`0x` + randomBytes.toString("hex"));
        return saltBigInt;
    }
    
    convertToHex(uint8Array: Uint8Array) {
        return Array.from(uint8Array)
        .map(byte => byte.toString(16))
        .join('');
    }

    uint8ArrayToBigInt(uint8Array: Uint8Array) {
        let result = BigInt(0);
        for (let i = 0; i < uint8Array.length; i++) {
            result = (result << BigInt(8)) | BigInt(uint8Array[i]);
        }
        return result;
    }

    async calculateCommitment(merkleRoot: BigInt, salt: BigInt) {
        if (!this.poseidon) {
            throw new Error("Poseidon not initialized. Call initialize() first.");
        }
        
        // Finally, combine board hash with salt
        const finalHash = this.poseidon.F.toString(this.poseidon([merkleRoot, salt]));
        
        // Convert final result to BigInt
        return finalHash;
        
    }

    // Merkle Tree implementation
    async calculateMerkleRoot(boardState: number[]) {
        if (!this.poseidon) {
            throw new Error("Poseidon not initialized. Call initialize() first.");
        }

        let leaves: number[] = [...boardState];
        while (leaves.length < 128) {
            leaves.push(0);
        }
        // Helper function to hash two elements
        const hash = (left: number, right: number) => {
            return this.poseidon.F.toString(this.poseidon([left, right]));
        };

        // Validate input
        if (leaves.length !== 2**this.levels) {
            throw new Error(`Expected ${2**this.levels} leaves, got ${leaves.length}`);
        }

        // Convert all leaves to strings (matching circuit behavior)
        leaves = leaves.map(leaf => leaf.toString());

        // Build tree level by level
        let currentLevel = [...leaves];

        for (let level = 0; level < this.levels; level++) {
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = currentLevel[i+1] || currentLevel[i]; // if odd number, duplicate last
                nextLevel.push(hash(left, right));
            }
            currentLevel = nextLevel;
        }

        // The root is the only element left
        return currentLevel[0];
    }

    async generateCorrectInput(ships, salt = null) {
    
        let boardState = Array(100).fill(0);
    
        // console.log("Generating board state from ship placements...\n");
    
        ships.forEach((ship, shipIndex) => {
            const [x, y, length, orientation] = ship;
    
            for (let i = 0; i < length; i++) {
                const cellX = x + ((1 - orientation) * i);
                const cellY = y + (orientation * i);
                const cellIndex = cellX * 10 + cellY;
    
                if (cellIndex >= 0 && cellIndex < 100) {
                    boardState[cellIndex] = 1;
                }
            }
        });
    
        // console.log("\n Generated Board state");
        // console.log(`const boardState = [`);
        // for (let row = 0; row < 10; row++) {
        //     const rowData = boardState.slice(row * 10, (row + 1) * 10);
        //     console.log(`  ${rowData.join(',')}, // Row ${row}`);
        // }
        // console.log("];");
    
        // console.log("\nBoard visualization:");
        for (let row = 0; row < 10; row++) {
            let rowStr = `${row}: `;
            for (let col = 0; col < 10; col++) {
                const index = row * 10 + col;
                rowStr += boardState[index] === 1 ? '■' : '·';
            }
            // console.log(rowStr);
        }
    
        // const totalShips = boardState.reduce((sum, cell) => sum + cell, 0);
        // const expectedTotal = this.shipSizes.reduce((sum, size) => sum + size, 0);
    
        // console.log(`\nTotal ships: ${totalShips}, Expected: ${expectedTotal}`);

        let currentSalt = salt;
        if (currentSalt === null) {
            currentSalt = this.generateSalt();
        }
        // console.log("Salt: ", currentSalt.toString());
    
        const merkleRoot = await this.calculateMerkleRoot(boardState);
        const commitment = await this.calculateCommitment(merkleRoot, currentSalt);
        
        const input = {
            ships: ships,
            board_state: boardState,
            salt: currentSalt.toString(),
            commitment: commitment.toString(), 
            merkle_root: merkleRoot.toString()
        };
        
        // console.log("\nComplete input object:");
        // console.log(JSON.stringify(input, null, 2));
        
        return input;
    }

    calculateShipPositions(ships: number[][]) {
        let positions: number[][] = [];
        ships.forEach((ship) => {
            const [x, y, length, orientation] = ship;

            for (let i = 0; i < length; i++) {
                const cellX = x + ((1 - orientation) * i);
                const cellY = y + (orientation * i);
                const cellIndex = cellX * 10 + cellY;
    
                if (cellIndex >= 0 && cellIndex < 100) {
                    positions.push([cellX, cellY]);
                }
            }
        });
        return positions;
    }

    generateRandomShipPositions() {
        let shipPositions = [];

        for (let i = 0; i < this.shipSizes.length; i++) {
            const length = this.shipSizes[i];
            const orientation = Math.random() < 0.5 ? 0 : 1;
            let x = Math.floor(Math.random() * 10);
            let y = Math.floor(Math.random() * 10);
            while (x + (1 - orientation) * (length - 1) < 0 || y + orientation * (length - 1) < 0 || x + (1 - orientation) * (length - 1) > 9 || y + orientation * (length - 1) > 9) {
                x = Math.floor(Math.random() * 10);
                y = Math.floor(Math.random() * 10);
            }
            shipPositions.push([x, y, length, orientation]);
        }
        return shipPositions;
    }

    async generateShipPlacementPositions(shipPositions: number[][]) {
        const correctInput = await this.generateCorrectInput(shipPositions);
        return correctInput;
    }
    
    validateInput(ships: number[][], boardState: number[]) {
        // console.log("Validating input...");
    
        let expectedBoard = Array(100).fill(0);
    
        const issues: string[] = [];
    
        ships.forEach((ship, shipIndex) => {
            const [x, y, length, orientation] = ship;
    
            if (x < 0 || x > 9 || y < 0 || y > 9) {
                issues.push(`Ship ${shipIndex + 1} is out of bounds: (${x}, ${y})`);
            }
    
            if (length !== this.shipSizes[shipIndex]) {
                issues.push(`Ship ${shipIndex + 1} has incorrect length: ${length} (expected ${this.shipSizes[shipIndex]})`);
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

        if (issues.length > 0) {
            console.log("\nValidation issues:");
            issues.forEach((issue) => console.log(`- ${issue}`));
            return false;
        }
        
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
            return false;
        } else {
            console.log("\nValidation successful!");
            return true;
        }
    }

    buffer32BytesToBigIntBE(buf: any) {
        return (
            (buf.readBigUInt64BE(0) << 192n) +
            (buf.readBigUInt64BE(8) << 128n) +
            (buf.readBigUInt64BE(16) << 64n) +
            buf.readBigUInt64BE(24)
        );
    }

    randomBytesCrypto(len: number) {
        if (len > 32) throw new Error("Length must be ≤ 32 for uint256 compatibility");
        const bytes = new Uint8Array(crypto.randomBytes(len));
        const buffer = Buffer.from(bytes);
        return this.buffer32BytesToBigIntBE(buffer);
    }
    
    async generateProof(input:any, wasmContent:any, zkeyContent:any) {
        const proof = await snarkjs.groth16.fullProve(input, wasmContent, zkeyContent);
        const calldataStr = await snarkjs.groth16.exportSolidityCallData(proof.proof, proof.publicSignals);
        const calldata = JSON.parse("[" + calldataStr + "]");
        return {calldata, proof};
    }

    async verifyProof(verificationKeyPath:any, proof:any) {
        const isValid = await snarkjs.groth16.verify(verificationKeyPath, proof.publicSignals, proof.proof);
        return isValid;
    }

    toHex(decimal: number) {
        return '0x' + BigInt(decimal).toString(16);
    }

    async createGame(
        gameId: string,
        player1: string,
        player1BoardCommitment: string,
        player1MerkleRoot: string,
        player1ShipPlacementProof: ZKCalldataProof
    ): Promise<void> {

        if (!this.gameState) {
            throw new GameStateChannelError("Game state not initialized");
        }
        this.gameState.gameId = gameId;
        this.gameState.player1 = player1;
        this.gameState.isActive = false;
        this.gameState.playerTurn = player1;
        this.gameState.nonce++;
        this.gameState.player1BoardCommitment = player1BoardCommitment;
        this.gameState.player1MerkleRoot = player1MerkleRoot;
        this.gameState.player1ShipPlacementProof = player1ShipPlacementProof;
        this.gameState.player1Hits = 0;

        await this.signGameState();
        this.emit('gameCreated', this.gameState);
    }

    async joinGame(
        player2: string, 
        player2BoardCommitment: string, 
        player2MerkleRoot: string,
        player2ShipPlacementProof: ZKCalldataProof
    ): Promise<void> {
        if (!this.gameState) {
            throw new GameStateChannelError("Game state not initialized");
        }

        if (this.gameState.player2 !== "") {
            throw new GameStateChannelError("Game already has two players");
        }

        this.gameState.player2 = player2;
        this.gameState.isActive = true;
        this.gameState.nonce++;
        this.gameState.player2BoardCommitment = player2BoardCommitment;
        this.gameState.player2MerkleRoot = player2MerkleRoot;
        this.gameState.player2ShipPlacementProof = player2ShipPlacementProof;
        this.gameState.player2Hits = 0;

        await this.signGameState();
        this.emit('gameJoined', this.gameState);
        this.emit('gameStarted', this.gameState);
    }

    async makeMove(
        player: string,
        move: Move, 
        moveProof: ZKCalldataProof,
        moveProofPublicData: ZKProofPublicData
    ): Promise<boolean> {
        if (!this.gameState) {
            throw new GameStateChannelError("Game state not initialized!");
        }

        if (!this.gameState.isActive) {
            throw new InvalidMoveError("Game is not active");
        }

        if (this.gameState.playerTurn !== player) {
            throw new InvalidMoveError("Not your turn");
        }

        if (this.gameState.winner) {
            throw new InvalidMoveError("Game is already finished");
        }

        const existingMove = this.gameState.moves.find(m => m.x === move.x && m.y === move.y);
        if (existingMove) {
            throw new InvalidMoveError("Move already made at this position");
        }

        if (!this.validateMoveProof(moveProof, moveProofPublicData, move)) {
            throw new InvalidMoveError("Invalid move proof");
        }

        // update the game states
        this.gameState.nonce++;
        this.gameState.moves.push(move);
        
        if (move.isHit) {
            if (player === this.gameState.player1) {
                this.gameState.player1Hits++;
            } else {
                this.gameState.player2Hits++;
            }
        }
        
        this.gameState.lastMove = {
            player,
            moveProof,
            moveProofPublicData,
            isHit: move.isHit,
            move
        };

        // Switch turns
        this.gameState.playerTurn = this.gameState.playerTurn === this.gameState.player1 
        ? this.gameState.player2 
        : this.gameState.player1;

        await this.signGameState();
        this.emit('moveMade', { player, move, gameState: this.gameState });

        // Check for win condition (assuming 17 total ship cells)
        if (this.gameState.player1Hits === 17 || this.gameState.player2Hits === 17) {
            const winner = this.gameState.player1Hits === 17 ? this.gameState.player1 : this.gameState.player2;
            await this.declareWinner(winner);
        }

        return true;
    }
}