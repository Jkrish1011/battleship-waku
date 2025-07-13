
interface ShipPlacementCommitment {
    hash: string;
    salt: string;
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

interface GameState {
    gameId: string;
    wakuRoomId: string;
    player1: string;
    player2: string;
    isActive: boolean;
    playerTurn: string;
    player1BoardCommitment: ShipPlacementCommitment;
    player2BoardCommitment: ShipPlacementCommitment;
    player1MerkleRoot: string;
    player2MerkleRoot: string;
    player1ShipPlacementProof: ZKCalldataProof;
    player2ShipPlacementProof: ZKCalldataProof;
    player1Hits: number;
    player2Hits: number;
    nonce: number;
    lastMove: {
        player: string;
        moveProof: ZKCalldataProof;
        moveProofPublicData: ZKProofPublicData;
        isHit: boolean;
    } | null;
    winner: string | null;
}

export class GameStateChannel {
    constructor() {

    }
}