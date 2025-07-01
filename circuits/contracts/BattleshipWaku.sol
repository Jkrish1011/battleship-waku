//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "./ship_placement.sol";
import "./move_verification.sol";
import "./win_verification.sol";

interface IShipPlacementVerifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[2] calldata _pubSignals) external view returns (bool);
}

interface IMoveVerifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[3] calldata _pubSignals) external view returns (bool);
}

interface IWinVerifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[3] calldata _pubSignals) external view returns (bool);
}

contract BattleshipWaku is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    IShipPlacementVerifier public shipPlacementVerifier;
    IMoveVerifier public moveVerifier;
    IWinVerifier public winVerifier;

    struct ShipPlacementProof {
        uint[2] pA;
        uint[2][2] pB;
        uint[2] pC;
        uint[2] pubSignals;
    }

    struct MoveProof {
        uint[2] pA;
        uint[2][2] pB;
        uint[2] pC;
        uint[3] pubSignals;
    }

    struct WinProof {
        uint[2] pA;
        uint[2][2] pB;
        uint[2] pC;
        uint[3] pubSignals;
    }

    struct Game {
        uint256 gameId;
        address player1;
        address player2;
        bool isActive;
        address playerTurn;
        bytes32 player1_board_commitment;
        bytes32 player1_merkle_root;
        bytes32 player2_board_commitment;
        bytes32 player2_merkle_root;
        mapping(address => uint8) player_hits;
        ShipPlacementProof player1ShipPlacementProof;
        ShipPlacementProof player2ShipPlacementProof;
        uint16 wakuRoomId;
    }

    struct GameView {
        uint256 gameId;
        address player1;
        address player2;
        bool isActive;
        address playerTurn;
        bytes32 player1_board_commitment;
        bytes32 player1_merkle_root;
        bytes32 player2_board_commitment;
        bytes32 player2_merkle_root;
        ShipPlacementProof player1ShipPlacementProof;
        ShipPlacementProof player2ShipPlacementProof;
        uint16 wakuRoomId;
    }

    mapping(uint256 => Game) public games;
    uint256 public gameCount;

    event GameCreated(uint256 indexed gameId, address player1, uint256 player1BoardCommitment, uint256 player1MerkleRoot);
    event GameJoined(uint256 indexed gameId, address player2);
    event GameStarted(uint256 indexed gameId);
    event MoveMade(uint256 indexedgameId, address player);
    event GameEnded(uint256 indexed gameId, address winner);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _shipPlacementVerifier, address _moveVerifier, address _winVerifier) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        shipPlacementVerifier = IShipPlacementVerifier(_shipPlacementVerifier);
        moveVerifier = IMoveVerifier(_moveVerifier);
        winVerifier = IWinVerifier(_winVerifier);
    }

    function createGame(
        address player1,
        ShipPlacementProof calldata shipPlacementProofPlayer1,
        uint256 gameId,
        uint16 wakuRoomId) external {
        require(player1 != address(0), "Invalid player addresses");
        require(games[gameId].isActive == false, "Game already exists");

        // Verify the ship placement is valid using ship_placement.circom
        bool isShipPlacementValid1 = shipPlacementVerifier.verifyProof(shipPlacementProofPlayer1.pA, shipPlacementProofPlayer1.pB, shipPlacementProofPlayer1.pC, shipPlacementProofPlayer1.pubSignals);
        require(isShipPlacementValid1, "Player 1 ship placement proof is invalid");

        // Create a new game
        Game storage newGame = games[gameId];
        newGame.gameId = gameId;
        newGame.wakuRoomId = wakuRoomId;
        newGame.player1 = player1;
        newGame.player2 = address(0);
        newGame.isActive = false;
        newGame.playerTurn = player1;
        newGame.player1_board_commitment = bytes32(shipPlacementProofPlayer1.pubSignals[0]);
        newGame.player1_merkle_root = bytes32(shipPlacementProofPlayer1.pubSignals[1]);
        newGame.player2_board_commitment = bytes32(0);
        newGame.player2_merkle_root = bytes32(0);
        newGame.player1ShipPlacementProof = shipPlacementProofPlayer1;
        newGame.player2ShipPlacementProof = ShipPlacementProof({
            pA: [uint256(0), uint256(0)],
            pB: [[uint256(0), uint256(0)], [uint256(0), uint256(0)]],
            pC: [uint256(0), uint256(0)],
            pubSignals: [uint256(0), uint256(0)]
        });
        newGame.player_hits[player1] = 0; 
        gameCount++;

        emit GameCreated(gameId, player1, shipPlacementProofPlayer1.pubSignals[0], shipPlacementProofPlayer1.pubSignals[1]);
    }

    function JoinGame(
        address player2, 
        ShipPlacementProof calldata shipPlacementProofPlayer2,
        uint256 gameId) external {
        require(player2 != address(0), "Invalid player addresses");
        require(games[gameId].player2 == address(0), "Game already started");

        // Verify the ship placement is valid using ship_placement.circom
        bool isShipPlacementValid2 = shipPlacementVerifier.verifyProof(shipPlacementProofPlayer2.pA, shipPlacementProofPlayer2.pB, shipPlacementProofPlayer2.pC, shipPlacementProofPlayer2.pubSignals);
        require(isShipPlacementValid2, "Player 2 ship placement proof is invalid");
        
        Game storage newGame = games[gameId];
        newGame.player2 = player2;
        newGame.isActive = true;
        newGame.player2_board_commitment = bytes32(shipPlacementProofPlayer2.pubSignals[0]);
        newGame.player2_merkle_root = bytes32(shipPlacementProofPlayer2.pubSignals[1]);
        newGame.player2ShipPlacementProof = shipPlacementProofPlayer2;
        newGame.player_hits[player2] = 0;

        emit GameJoined(gameId, player2);
        emit GameStarted(gameId);
    }

    function getGame(uint256 gameId) external view returns (GameView memory gameData, uint8 player1Hits, uint8 player2Hits) {
        Game storage game = games[gameId];
        gameData = GameView({
            gameId: game.gameId,
            wakuRoomId: game.wakuRoomId,
            player1: game.player1,
            player2: game.player2,
            isActive: game.isActive,
            playerTurn: game.playerTurn,
            player1_board_commitment: game.player1_board_commitment,
            player1_merkle_root: game.player1_merkle_root,
            player2_board_commitment: game.player2_board_commitment,
            player2_merkle_root: game.player2_merkle_root,
            player1ShipPlacementProof: game.player1ShipPlacementProof,
            player2ShipPlacementProof: game.player2ShipPlacementProof
        });
        player1Hits = game.player_hits[game.player1];
        player2Hits = game.player_hits[game.player2];
    }

    function getAllGames() external view returns (GameView[] memory) {
        GameView[] memory allGames = new GameView[](gameCount);
        for(uint256 i = 0; i < gameCount; i++) {
            allGames[i] = GameView({
                gameId: games[i].gameId,
                wakuRoomId: games[i].wakuRoomId,
                player1: games[i].player1,
                player2: games[i].player2,
                isActive: games[i].isActive,
                playerTurn: games[i].playerTurn,
                player1_board_commitment: games[i].player1_board_commitment,
                player1_merkle_root: games[i].player1_merkle_root,
                player2_board_commitment: games[i].player2_board_commitment,
                player2_merkle_root: games[i].player2_merkle_root,
                player1ShipPlacementProof: games[i].player1ShipPlacementProof,
                player2ShipPlacementProof: games[i].player2ShipPlacementProof
            });
        }
        return allGames;
    }

    function getGameStatus(uint256 gameId) external view returns (bool) {
        return games[gameId].isActive;
    }

    function getGamePlayers(uint256 gameId) external view returns (address, address) {
        return (games[gameId].player1, games[gameId].player2);
    }

    function makeMove(uint256 gameId, MoveProof memory moveProof) external returns (bool) {
        Game storage game = games[gameId];
        require(game.isActive, "Game is not active");
        require(game.playerTurn == msg.sender, "Not your turn");

        // Verify the move is valid using move_verification.circom
        bool isMoveValid = moveVerifier.verifyProof(moveProof.pA, moveProof.pB, moveProof.pC, moveProof.pubSignals);
        require(isMoveValid, "Move proof is invalid");
        
        // Update the game state
        if(moveProof.pubSignals[2] == 0x0000000000000000000000000000000000000000000000000000000000000001) {
            game.player_hits[game.playerTurn]++;
        }
        game.playerTurn = game.playerTurn == game.player1 ? game.player2 : game.player1;

        // Emit the move event
        emit MoveMade(gameId, msg.sender);
        return isMoveValid;
    }

    function winVerification(uint256 gameId, WinProof memory winProof) external returns (bool) {
        Game storage game = games[gameId];
        require(game.isActive, "Game is not active");

        address winner;
        if(game.player_hits[game.player1] == 12) {
            winner = game.player1;
        } else if(game.player_hits[game.player2] == 12) {
            winner = game.player2;
        } else {
            revert("Game is not over");
        }

        // Verify the move is valid using win_verification.circom
        bool isWinValid = winVerifier.verifyProof(winProof.pA, winProof.pB, winProof.pC, winProof.pubSignals);
        require(isWinValid, "Win proof is invalid");

        // Update the game state
        game.isActive = false;
        gameCount--;

        // Emit the game ended event
        emit GameEnded(gameId, winner);

        return isWinValid;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}