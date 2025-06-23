//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./ship_placement.sol";

interface IShipPlacementVerifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[2] calldata _pubSignals) external view returns (bool);
}

contract BattleshipWaku is Ownable {

    IShipPlacementVerifier public immutable shipPlacementVerifier;

    struct ShipPlacementProof {
        uint[2] pA;
        uint[2][2] pB;
        uint[2] pC;
        uint[2] pubSignals;
    }

    struct Game {
        uint256 gameId;
        address player1;
        address player2;
        bool isActive;
        address playerTurn;
        ShipPlacementProof player1ShipPlacementProof;
        ShipPlacementProof player2ShipPlacementProof;
    }

    mapping(uint256 => Game) public games;

    event GameCreated(uint256 indexed gameId, address player1, address player2, uint256 player1BoardCommitment, 
        uint256 player1MerkleRoot, uint256 player2BoardCommitment, uint256 player2MerkleRoot);

    event MoveMade(uint256 gameId, address player);
    
    constructor(address _shipPlacementVerifier) Ownable(msg.sender) {
        shipPlacementVerifier = IShipPlacementVerifier(_shipPlacementVerifier);
    }

    function createGame(
        address player1, 
        address player2, 
        ShipPlacementProof memory shipPlacementProofPlayer1,
        ShipPlacementProof memory shipPlacementProofPlayer2,
        uint256 gameId) external onlyOwner {
        require(player1 != address(0) && player2 != address(0), "Invalid player addresses");
        require(player1 != player2, "Players cannot be the same");
        require(games[gameId].isActive == false, "Game already exists");

        Game memory newGame = Game({
            gameId: gameId,
            player1: player1,
            player2: player2,
            isActive: true,
            playerTurn: player1,
            player1ShipPlacementProof: shipPlacementProofPlayer1,
            player2ShipPlacementProof: shipPlacementProofPlayer2
        });

        games[gameId] = newGame;
        // Verify the ship placement is valid using ship_placement.circom
        emit GameCreated(gameId, player1, player2, shipPlacementProofPlayer1.pubSignals[0], 
            shipPlacementProofPlayer1.pubSignals[1], shipPlacementProofPlayer2.pubSignals[0], 
            shipPlacementProofPlayer2.pubSignals[1]);
    }

    function getGame(uint256 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    function getGameStatus(uint256 gameId) external view returns (bool) {
        return games[gameId].isActive;
    }

    function getGamePlayers(uint256 gameId) external view returns (address, address) {
        return (games[gameId].player1, games[gameId].player2);
    }

    function makeMove(uint256 gameId, uint256 x, uint256 y) external {
        require(games[gameId].isActive, "Game is not active");
        require(games[gameId].playerTurn == msg.sender, "Not your turn");

        // Verify the move is valid using move_verification.circom
    }


    function winVerification(uint256 gameId) external {
        require(games[gameId].isActive, "Game is not active");
        // Verify the move is valid using win_verification.circom


    }
    

}