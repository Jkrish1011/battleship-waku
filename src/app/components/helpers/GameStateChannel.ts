
import { ethers } from 'ethers';

interface ShipPlacementCommitment {
    commitment: string; // bytes 32
}

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

interface GameState {
    gameId: string;
    wakuRoomId: string;
    player1: string;
    player2: string;
    isActive: boolean;
    playerTurn: string;
    player1BoardCommitment: ShipPlacementCommitment | null;
    player2BoardCommitment: ShipPlacementCommitment | null;
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

    constructor(gameId: string, wakuRoomId: string, signer?: ethers.Signer) {
        this.gameState = {
            gameId: gameId,
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
        this.signer = signer || null;
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
    ): ShipPlacementCommitment {
        
        const flatBoard = boardData.flat();

        const commitment = ethers.solidityPackedKeccak256(
            ['uint8[100]', 'bytes32'], 
            [ flatBoard, ethers.keccak256(ethers.toUtf8Bytes(salt)) ]
        );
        return {
            commitment: commitment
        }
    }

    // Helper method to verify commitment matches board data
    static verifyShipPlacementCommitment(
        commitment: ShipPlacementCommitment,
        boardData: number[][],
        salt: string
    ): boolean {
        const expectedCommitment = GameStateChannel.createShipPlacementCommitment(boardData, salt);
        return commitment.commitment === expectedCommitment.commitment;
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

        return ethers.solidityPackedKeccak256(types, values);
    }

    private async signGameState(): Promise<void> {
        if (!this.signer || !this.gameState) {
            return;
        }
        const stateHash = this.computeStateHash();
        const messageHash = ethers.hashMessage(ethers.getBytes(stateHash));
        const signature = await this.signer.signMessage(ethers.getBytes(stateHash));

        const signerAddress = await this.signer.getAddress();
        if(signerAddress === this.gameState.player1) {
            this.gameState.signatures.player1 = signature;
        } else if(signerAddress === this.gameState.player2) {
            this.gameState.signatures.player2 = signature;
        }
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

    async createGame(
        player1: string,
        player1BoardCommitment: ShipPlacementCommitment,
        player1MerkleRoot: string,
        player1ShipPlacementProof: ZKCalldataProof
    ): Promise<void> {

        if (!this.gameState) {
            throw new GameStateChannelError("Game state not initialized");
        }
        this.gameState.player1 = player1;
        this.gameState.isActive = false;
        this.gameState.playerTurn = player1;
        this.gameState.nonce++;
        this.gameState.player1BoardCommitment = player1BoardCommitment;
        this.gameState.player1MerkleRoot = player1MerkleRoot;
        this.gameState.player1Hits = 0;

        await this.signGameState();
        this.emit('gameCreated', this.gameState);
    }

    async joinGame(
        player2: string, 
        player2BoardCommitment: ShipPlacementCommitment, 
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