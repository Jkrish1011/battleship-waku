
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
    private MessageQueue: StateChannelMessage[] = [];
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

    async joinGame(player2: string, 
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
}