//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";


import "./ship_placement.sol";
import "./move_verification.sol";
import "./win_verification.sol";

interface IShipPlacementVerifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[2] calldata _pubSignals) external view returns (bool);
}

interface IMoveVerifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[7] calldata _pubSignals) external view returns (bool);
}

interface IWinVerifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[3] calldata _pubSignals) external view returns (bool);
}

contract BattleshipStateChannel is Initializable, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    
    IShipPlacementVerifier public shipPlacementVerifier;
    IMoveVerifier public moveVerifier;
    IWinVerifier public winVerifier;

    // A constant hash of the EIP-712 struct type definition.
    // This is keccak256("GameState(uint256 nonce,address currentTurn,uint256 moveCount,bytes32 player1ShipCommitment,bytes32 player2ShipCommitment,uint8 player1Hits,uint8 player2Hits,bool gameEnded,address winner,uint256 timestamp)")
    // Make sure there are no spaces and types are canonical (e.g., uint256, not uint).
    bytes32 public constant GAMESTATE_TYPEHASH = keccak256(
        "GameState(uint256 nonce,address currentTurn,uint256 moveCount,bytes32 player1ShipCommitment,bytes32 player2ShipCommitment,uint8 player1Hits,uint8 player2Hits,bool gameEnded,address winner,uint256 timestamp,bytes32 lastMoveHash)"
    );

    // The domain separator, unique to this contract instance.
    bytes32 public DOMAIN_SEPARATOR;

    // Game Constants
    uint256 public constant CHALLENGE_PERIOD = 5 minutes;
    uint256 public constant RESPONSE_PERIOD = 2 minutes;
    uint256 public constant MAX_MOVES = 100; // Prevent infinite games
    uint256 public constant TOTAL_SHIP_CELLS = 12; // 3 + 3 + 2 + 2 + 2

    // Game Dispute Status
    enum ChannelStatus { Open, Disputed, Settled, Closed }
    enum DisputeType { 
        InvalidMove, // Move outside 0-9 range
        InvalidShipPlacement, // Board doesn't match original commitment
        InvalidHitResult,  // Hit/miss doesn't match board
        ReusedMove, // Same position guessed twice
        InvalidProof, // Invalid proof submitted
        MaliciousDispute, // Dispute initiated by malicious player
        InvalidStateChain, // Invalid state chain submitted,
        GameContextMismatch   // Game ID or player ID mismatch
    }
    enum DisputeStatus { Active, Challenged, Resolved }

    // Proof Structs
    struct ShipPlacementProof {
        uint[2] pA;
        uint[2][2] pB;
        uint[2] pC;
        uint[2] pubSignals; // [commitment_hash, merkle_root]
    }

    struct MoveProof {
        uint[2] pA;
        uint[2][2] pB;
        uint[2] pC;
        uint[7] pubSignals; // [ship_commitment, prev_hash, move_count, hit, game_id, player_id, current_move_hash]
    }

    struct WinProof {
        uint[2] pA;
        uint[2][2] pB;
        uint[2] pC;
        uint[3] pubSignals; // [total_hits, winner_address, game_hash]
    }

    struct Channel {
        uint256 channelId;
        address player1;
        address player2;
        ChannelStatus status;
        uint256 openedAt;
        bytes32 latestStateHash;
        uint256 latestNonce;
        address winner;
        uint256 settlementTime;
        mapping(address => bool) hasSubmittedInitialState;
    }

    struct GameState {
        uint256 nonce;
        address currentTurn;
        uint256 moveCount;
        bytes32 player1ShipCommitment;
        bytes32 player2ShipCommitment;
        uint8 player1Hits;
        uint8 player2Hits;
        bool gameEnded;
        address winner;
        uint256 timestamp;
        bytes32 lastMoveHash;
    }

    struct Dispute {
        uint256 channelId;
        address challenger;
        address respondent;
        DisputeType disputeType;
        DisputeStatus status;
        uint256 challengeTime;
        uint256 responseDeadline;
        bytes32 challengedStateHash;
        uint256 challengedNonce;
        GameState challengedState;
        bool resolved;
        bytes32 disputedMoveHash;
    }

    struct StateSubmission {
        GameState gameState;
        bytes signature1;
        bytes signature2;
        ShipPlacementProof[] shipPlacementProofs;
        MoveProof[] moveProofs;
        WinProof winProof;
    }
    
    mapping(uint256 => Channel) public channels;
    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => uint256) public channelToDispute; // channelId -> disputeId
    mapping(bytes32 => GameState) public gameStates; // stateHash -> GameState
    mapping(uint256 => mapping(bytes32 => bool)) public verifiedMoveHashes; // channelId -> moveHash -> verified

    uint256 public nextChannelId;
    uint256 public nextDisputeId;

    event ChannelOpened(uint256 indexed channelId, address indexed player1, address indexed player2);
    event InitialStateSubmitted(uint256 indexed channelId, address indexed player, bytes32 stateHash);
    event ChannelReady(uint256 indexed channelId, bytes32 initialStateHash);
    event DisputeInitiated(uint256 indexed channelId, uint256 indexed disputeId, address indexed challenger, DisputeType disputeType);
    event DisputeChallenged(uint256 indexed disputeId, address indexed respondent, bytes32 newStateHash);
    event DisputeResolved(uint256 indexed disputeId, address indexed winner, bytes32 finalStateHash);
    event ChannelSettled(uint256 indexed channelId, address indexed winner);
    event ChannelClosed(uint256 indexed channelId);
    event TimeoutClaimed(uint256 indexed channelId, address indexed claimer);
    event MoveHashVerified(uint256 indexed channelId, bytes32 indexed moveHash, address indexed player);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _shipPlacementVerifier, address _moveVerifier, address _winVerifier) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        shipPlacementVerifier = IShipPlacementVerifier(_shipPlacementVerifier);
        moveVerifier = IMoveVerifier(_moveVerifier);
        winVerifier = IWinVerifier(_winVerifier);
        
        nextChannelId = 1;
        nextDisputeId = 1;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Battleship")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function _verifyMoveProof(
        MoveProof calldata moveProof,
        Channel storage channel,
        GameState memory expectedState
    ) internal view returns (bool) {
        // zk verification
        bool isProofValid = moveVerifier.verifyProof(
            moveProof.pA,
            moveProof.pB,
            moveProof.pC,
            moveProof.pubSignals
        );
        if (!isProofValid) {
            return false;
        }

        // game context verfication
        require(moveProof.pubSignals[4] == channel.channelId, "Game ID mismatch");
        uint256 playerId = moveProof.pubSignals[5];
        address expectedPlayer = playerId == 0? channel.player1 : channel.player2;
        require(expectedState.currentTurn == expectedPlayer, "Player ID mismatch");

        // Ship Commitment verifications
        bytes32 proofShipCommitment = bytes32(moveProof.pubSignals[0]);
        bytes32 expectedShipCommitment = playerId == 0? expectedState.player1ShipCommitment : expectedState.player2ShipCommitment;
        require(proofShipCommitment == expectedShipCommitment, "Ship Commitment mismatch");

        // Move count verfication
        require(moveProof.pubSignals[2] == expectedState.moveCount, "Move count mismatch");

        // Move Hash Verfication
        if (expectedState.moveCount > 0) {
            require(bytes32(moveProof.pubSignals[1]) == expectedState.lastMoveHash, "Move hash mismatch");
        } else {
            require(bytes32(moveProof.pubSignals[1]) == 0, "First move should have zero as previous hash");
        }
        return true;
    }

    function _validateStateTransition(
        GameState memory fromState,
        GameState memory toState,
        MoveProof calldata moveProof
    ) internal pure returns (bool) {
        // Verify nonce progression
        require(toState.nonce > fromState.nonce, "Invalid nonce progression");

        // Verify move count progression
        require(toState.moveCount == fromState.moveCount + 1, "Invalid move count progression");

        // Verify move hash update
        require(toState.lastMoveHash == bytes32(moveProof.pubSignals[6]), "Move hash not updated correctly");

        // Verify hit count progression
        uint256 hit = moveProof.pubSignals[3];
        uint256 playerId = moveProof.pubSignals[5];
        
        if (playerId == 0) {
            // Player 1 made the move
            require(toState.player1Hits == fromState.player1Hits + hit, "Invalid player1 hit count");
            require(toState.player2Hits == fromState.player2Hits, "Player2 hits should not change");
        } else {
            // Player 2 made the move
            require(toState.player2Hits == fromState.player2Hits + hit, "Invalid player2 hit count");
            require(toState.player1Hits == fromState.player1Hits, "Player1 hits should not change");
        }

        // Verify ship commitments remain unchanged
        require(toState.player1ShipCommitment == fromState.player1ShipCommitment, "Player1 ship commitment changed");
        require(toState.player2ShipCommitment == fromState.player2ShipCommitment, "Player2 ship commitment changed");

        // Check for game end condition
        if (toState.player1Hits >= TOTAL_SHIP_CELLS) {
            require(toState.gameEnded == true && toState.winner == toState.currentTurn, "Invalid game end for player1");
        } else if (toState.player2Hits >= TOTAL_SHIP_CELLS) {
            require(toState.gameEnded == true && toState.winner == toState.currentTurn, "Invalid game end for player2");
        }

        return true;
    }

    function _getSigner(bytes32 stateHash, bytes calldata signature) internal view returns (address) {
        // Compute the EIP-712 digest
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01", // EIP-191 prefix for signed typed data
                DOMAIN_SEPARATOR,
                stateHash
            )
        );

        // Recover the signer's address from the digest and signature
        (bytes32 r, bytes32 s, uint8 v) = _splitSignature(signature);
        address signer = ecrecover(digest, v, r, s);

        return signer;
    }

    function _verifySignature(bytes32 stateHash, bytes calldata signature, address signer) internal view returns (bool) {
        address recoveredSigner = _getSigner(stateHash, signature);
        return signer == recoveredSigner;
    }

    /**
     * @dev Splits a 65-byte signature into its r, s, and v components.
     * This version is compatible with Solidity ^0.8.0.
     */
    function _splitSignature(bytes calldata sig) private pure returns (bytes32 r, bytes32 s, uint8 v) {
        // The signature must be exactly 65 bytes long.
        require(sig.length == 65, "invalid signature length");

        assembly {
            // The location of the signature data in calldata is `sig.offset`.
            // The first 32 bytes of the signature is the `r` value.
            r := calldataload(sig.offset)
            
            // The next 32 bytes is the `s` value.
            s := calldataload(add(sig.offset, 32))
            
            // The last byte is the `v` value.
            // We load the 32-byte word starting at the 64th byte, and then extract the first byte.
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // Helper function to compute state hash - reduces stack depth in main functions
    function _computeStateHash(GameState memory state) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                GAMESTATE_TYPEHASH,
                state.nonce,
                state.currentTurn,
                state.moveCount,
                state.player1ShipCommitment,
                state.player2ShipCommitment,
                state.player1Hits,
                state.player2Hits,
                state.gameEnded,
                state.winner,
                state.timestamp,
                state.lastMoveHash
            )
        );
    }

    function openChannel(address player2) external returns(uint256 channelId) {
        require(player2 != address(0), "Invalid player addresses");
        require(player2 != msg.sender, "Cannot play against yourself");
        
        channelId = nextChannelId++;
        Channel storage channel = channels[channelId];

        channel.channelId = channelId;
        channel.player1 = msg.sender;
        channel.player2 = player2;
        channel.status = ChannelStatus.Open;
        channel.openedAt = block.timestamp;
        channel.latestNonce = 0;

        emit ChannelOpened(channelId, msg.sender, player2);
        return channelId;    
    }

    function submitInitialState(
        uint256 channelId,
        GameState memory initialState,
        bytes calldata signature,
        ShipPlacementProof calldata shipProof
    ) external returns(bytes32) {
        Channel storage channel = channels[channelId];
        require(channel.status == ChannelStatus.Open, "Channel not open");
        require(msg.sender == channel.player1 || msg.sender == channel.player2, "Not a player");
        require(!channel.hasSubmittedInitialState[msg.sender], "Already submitted initial state");

        bool isShipPlacementValid = shipPlacementVerifier.verifyProof(shipProof.pA, shipProof.pB, shipProof.pC, shipProof.pubSignals);
        require(isShipPlacementValid, "Invalid ship placement proof");

        // Hash the GameState struct data using GAMESTATE_TYPEHASH
        bytes32 stateHash = _computeStateHash(initialState);
        
        address signer = _getSigner(stateHash, signature);
        
        // Verify that the signer is the message sender
        require(signer == msg.sender, "Invalid signer");

        channel.hasSubmittedInitialState[msg.sender] = true;

        emit InitialStateSubmitted(channelId, msg.sender, stateHash);

        // If both players have submitted their state, the channel is ready
        if (channel.hasSubmittedInitialState[channel.player1] && channel.hasSubmittedInitialState[channel.player2]) {
            channel.latestStateHash = stateHash;
            emit ChannelReady(channelId, stateHash);
        }
        gameStates[stateHash] = initialState;
        return stateHash;
    }

    function initiateDispute(
        uint256 channelId,
        DisputeType disputeType,
        GameState memory challengedState,
        bytes calldata signature1,
        bytes calldata signature2,
        bytes32 disputedMoveHash
    ) external {
        Channel storage channel = channels[channelId];
        require(channel.status == ChannelStatus.Open, "Channel not opened");
        require(msg.sender == channel.player1 || msg.sender == channel.player2, "Not a player");
        require(channelToDispute[channelId] == 0, "Dispute already initiated");

        address respondent = msg.sender == channel.player1 ? channel.player2 : channel.player1;
        bytes32 stateHash = _computeStateHash(challengedState);

        if(disputeType == DisputeType.InvalidMove || disputeType == DisputeType.InvalidProof) {
            _handleMoveDisputeInitiation(channelId, challengedState, signature1, signature2, channel, respondent, stateHash, disputedMoveHash);
        } else if(disputeType == DisputeType.MaliciousDispute) {
            _handleMaliciousDisputeInitiation(channelId, challengedState, signature1, signature2, channel, respondent, stateHash, disputedMoveHash);
        } else {
            require(_verifySignature(stateHash, signature1, channel.player1), "Invalid signature 1");
            require(_verifySignature(stateHash, signature2, channel.player2), "Invalid signature 2");

            // Create dispute - moved to separate scope to reduce stack depth
            _createDispute(channelId, disputeType, challengedState, stateHash, respondent, disputedMoveHash);
        }        
    }

    function _handleMaliciousDisputeInitiation(
        uint256 channelId,
        GameState memory challengedState,
        bytes calldata signature1,
        bytes calldata signature2,
        Channel storage channel,
        address respondent,
        bytes32 stateHash,
        bytes32 disputedMoveHash
    ) internal {
        if (msg.sender == channel.player1) {
            require(_verifySignature(stateHash, signature1, channel.player1), "Invalid signature 1");
            // signature2 can be empty since player2 provided invalid proof
        } else {
            require(_verifySignature(stateHash, signature2, channel.player2), "Invalid signature 2");
            // signature1 can be empty since player1 provided invalid proof
        }
        
        _createDispute(channelId, DisputeType.MaliciousDispute, challengedState, stateHash, respondent, disputedMoveHash);
    }

   function _handleMoveDisputeInitiation(
        uint256 channelId,
        GameState memory challengedState,
        bytes calldata signature1,
        bytes calldata signature2,
        Channel storage channel,
        address respondent,
        bytes32 stateHash,
        bytes32 disputedMoveHash
    ) internal {
        // Only require challenger's signature for move disputes
        if (msg.sender == channel.player1) {
            require(_verifySignature(stateHash, signature1, channel.player1), "Invalid challenger signature");
        } else {
            require(_verifySignature(stateHash, signature2, channel.player2), "Invalid challenger signature");
        }
        
        _createDispute(channelId, DisputeType.InvalidMove, challengedState, stateHash, respondent, disputedMoveHash);
    }

    // Helper function to create dispute - reduces stack depth
    function _createDispute(
        uint256 channelId,
        DisputeType disputeType,
        GameState memory challengedState,
        bytes32 stateHash,
        address respondent,
        bytes32 disputedMoveHash
    ) internal {
        uint256 disputeId = nextDisputeId++;
        Dispute storage dispute = disputes[disputeId];

        dispute.channelId = channelId;
        dispute.challenger = msg.sender;
        dispute.respondent = respondent;
        dispute.disputeType = disputeType;
        dispute.status = DisputeStatus.Active;
        dispute.challengeTime = block.timestamp;
        dispute.responseDeadline = block.timestamp + RESPONSE_PERIOD;
        dispute.challengedStateHash = stateHash;
        dispute.challengedNonce = challengedState.nonce;
        dispute.challengedState = challengedState;
        dispute.disputedMoveHash = disputedMoveHash;

        channelToDispute[channelId] = disputeId;
        channels[channelId].status = ChannelStatus.Disputed;

        // Store the challenged state
        gameStates[stateHash] = challengedState;

        emit DisputeInitiated(channelId, disputeId, msg.sender, disputeType);
    }

    function _verifyDisputeResponse(
        Dispute storage dispute,
        MoveProof calldata disputedStateMoveProof,
        GameState memory preDisputedMoveState,
        GameState memory counterState,
        Channel storage channel
    ) internal view returns (bool) {

        // Verify the move proof
        bool isProofValid = _verifyMoveProof(disputedStateMoveProof, channel, counterState);
        if (!isProofValid) {
            return false;
        }

        // Verify state transition is valid
        bool isTransitionValid = _validateStateTransition(preDisputedMoveState, counterState, disputedStateMoveProof);
        if (!isTransitionValid) {
            return false;
        }

        // Verify the disputed move hash matches
        if (dispute.disputedMoveHash != bytes32(0)) {
            require(bytes32(disputedStateMoveProof.pubSignals[6]) == dispute.disputedMoveHash, "Move hash mismatch");
        }

        return _validateSpecificDisputeType(dispute.disputeType, disputedStateMoveProof, preDisputedMoveState, counterState);
    }

    function _validateSpecificDisputeType(
        DisputeType disputeType,
        MoveProof calldata moveProof,
        GameState memory preState,
        GameState memory postState
    ) internal pure returns (bool) {
        if (disputeType == DisputeType.InvalidMove) {
            // Circuit should handle coordinate validation, but double-check
            uint256 x = moveProof.pubSignals[2] / 10; // Extract from move encoding
            uint256 y = moveProof.pubSignals[2] % 10;
            return (x < 10 && y < 10);
        }
        
        if (disputeType == DisputeType.InvalidHitResult) {
            // Hit result validation is handled by the circuit
            // If proof is valid, hit result is correct
            return true;
        }
        
        if (disputeType == DisputeType.InvalidShipPlacement) {
            // Ship commitment consistency is checked in _verifyMoveProof
            return true;
        }
        
        if (disputeType == DisputeType.InvalidStateChain) {
            // Move chain validation is handled in _verifyMoveProof
            return true;
        }

        if (disputeType == DisputeType.GameContextMismatch) {
            // Game ID and player ID validation is handled in _verifyMoveProof
            return true;
        }

        // For other dispute types, if proof is valid, dispute response is valid
        return true;
    }

    function respondToDispute(
        uint256 disputeId,
        GameState memory counterState,
        bytes calldata signature1,
        bytes calldata signature2,
        MoveProof calldata disputedStateMoveProof,
        GameState memory preDisputedMoveState
    ) external {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.Active, "Dispute not active");
        require(dispute.responseDeadline > block.timestamp, "Response deadline passed");
        require(msg.sender == dispute.respondent, "Not the respondent");
        
        Channel storage channel = channels[dispute.channelId];

        // Verify that the counter-state has high nonce
        require(counterState.nonce >= dispute.challengedNonce, "Nonce too low. Counter-state must have higher or equal nonce");

        // Verify signatures on counter-state
        bytes32 counterStateHash = _computeStateHash(counterState);
        require(_verifySignature(counterStateHash, signature1, channel.player1), "Invalid signature 1");
        require(_verifySignature(counterStateHash, signature2, channel.player2), "Invalid signature 2");

        // Verify the disputed move proof
        bool isValidResponse = _verifyDisputeResponse(
            dispute,
            disputedStateMoveProof,
            preDisputedMoveState,
            counterState,
            channel
        );

        if(isValidResponse) {
            // Respondent wins
            channel.winner = msg.sender;
            channel.latestStateHash = counterStateHash;
            channel.latestNonce = counterState.nonce;

            verifiedMoveHashes[channel.channelId][bytes32(disputedStateMoveProof.pubSignals[6])] = true;
            emit MoveHashVerified(channel.channelId, bytes32(disputedStateMoveProof.pubSignals[6]), msg.sender);
        } else {
            channel.winner = dispute.challenger; // Challenger wins
            channel.latestStateHash = dispute.challengedStateHash;
            channel.latestNonce = dispute.challengedNonce;
        }

        channel.settlementTime = block.timestamp;
        channel.status = ChannelStatus.Settled;

        // update the dispute
        dispute.status = DisputeStatus.Resolved;
        dispute.resolved = true;
        dispute.challengedStateHash = counterStateHash;
        dispute.challengedState = counterState;
        dispute.challengedNonce = counterState.nonce;
        dispute.responseDeadline = block.timestamp + RESPONSE_PERIOD;

        // Store counter-state
        gameStates[counterStateHash] = counterState;

        emit DisputeResolved(disputeId, channel.winner, dispute.challengedStateHash);
        emit ChannelSettled(dispute.channelId, channel.winner);
    }

    function resolveDispute(uint256 disputeId) external {
        Dispute storage dispute = disputes[disputeId];
        require(!dispute.resolved, "Dispute already resolved");
        require(dispute.status == DisputeStatus.Active && block.timestamp > dispute.responseDeadline, "Dispute not active or response deadline not passed");

        Channel storage channel = channels[dispute.channelId];
        
        // Challenger wins if respondent of the game does not respond in time.
        channel.status = ChannelStatus.Settled;
        channel.winner = dispute.challenger;
        channel.latestStateHash = dispute.challengedStateHash;
        channel.latestNonce = dispute.challengedNonce;
        channel.settlementTime = block.timestamp;

        dispute.resolved = true;
        dispute.status = DisputeStatus.Resolved;

        emit DisputeResolved(disputeId, dispute.challenger, dispute.challengedStateHash);
        emit ChannelSettled(dispute.channelId, dispute.challenger);
    }

    function settleChannel(
        uint256 channelId, 
        GameState memory finalState,
        bytes calldata signature1,
        bytes calldata signature2,
        WinProof calldata winProof
    ) external nonReentrant {
        Channel storage channel = channels[channelId];
        require(channel.status == ChannelStatus.Open, "Channel not open for settlement");
        require(msg.sender == channel.player1 || msg.sender == channel.player2, "Not a player");
        require(channel.hasSubmittedInitialState[channel.player1] && channel.hasSubmittedInitialState[channel.player2], "Both players must submit initial state");
        require(channelToDispute[channelId] == 0, "Channel has an active dispute on-going!");

        bytes32 stateHash = _computeStateHash(finalState);
        require(_verifySignature(stateHash, signature1, channel.player1), "Invalid Player 1 signature");
        require(_verifySignature(stateHash, signature2, channel.player2), "Invalid Player 2 signature");

        bool isWinProofValid = winVerifier.verifyProof(winProof.pA, winProof.pB, winProof.pC, winProof.pubSignals);
        require(isWinProofValid, "Invalid win proof");

        // Verify game end conditions
        require(finalState.gameEnded == true, "Game must be ended");
        require(finalState.winner != address(0), "Winner must be set");
        require(finalState.winner == channel.player1 || finalState.winner == channel.player2, "Invalid winner");

        // Verify win condition (one player should have hit all ship cells)
        require(finalState.player1Hits >= TOTAL_SHIP_CELLS || finalState.player2Hits >= TOTAL_SHIP_CELLS, "No player has won yet");

        channel.status = ChannelStatus.Settled;
        channel.winner = finalState.winner;
        channel.latestStateHash = stateHash;
        channel.latestNonce = finalState.nonce;
        channel.settlementTime = block.timestamp;
        // Store final state
        gameStates[stateHash] = finalState;

        emit ChannelSettled(channelId, channel.winner);
    }

    function claimTimeout(uint256 channelId) external {
        Channel storage channel = channels[channelId];
        require(channel.status != ChannelStatus.Settled, "Channel already settled!");
        require(msg.sender == channel.player1 || msg.sender == channel.player2, "Not a player");
        require(block.timestamp > channel.openedAt + CHALLENGE_PERIOD * 7, "Challenge period not over");

        // Award win to the claimer (assuming the other player just abandoned)
        channel.status = ChannelStatus.Settled;
        channel.winner = msg.sender;
        channel.settlementTime = block.timestamp;

        emit TimeoutClaimed(channelId, msg.sender);
        emit ChannelSettled(channelId, msg.sender);
    }

     function getChannel(uint256 channelId) external view returns (
        uint256,
        address,
        address,
        ChannelStatus,
        uint256,
        bytes32,
        uint256,
        address,
        uint256
    ) {
        Channel storage channel = channels[channelId];
        return (
            channel.channelId,
            channel.player1,
            channel.player2,
            channel.status,
            channel.openedAt,
            channel.latestStateHash,
            channel.latestNonce,
            channel.winner,
            channel.settlementTime
        );
    }

    function getDispute(uint256 disputeId) external view returns (
        uint256,
        address,
        address,
        DisputeType,
        DisputeStatus,
        uint256,
        uint256,
        bytes32,
        uint256,
        bool
    ) {
        Dispute storage dispute = disputes[disputeId];
        return (
            dispute.channelId,
            dispute.challenger,
            dispute.respondent,
            dispute.disputeType,
            dispute.status,
            dispute.challengeTime,
            dispute.responseDeadline,
            dispute.challengedStateHash,
            dispute.challengedNonce,
            dispute.resolved
        );
    }

    function getGameState(bytes32 stateHash) external view returns (GameState memory) {
        return gameStates[stateHash];
    }
}