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
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[3] calldata _pubSignals) external view returns (bool);
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
        "GameState(uint256 nonce,address currentTurn,uint256 moveCount,bytes32 player1ShipCommitment,bytes32 player2ShipCommitment,uint8 player1Hits,uint8 player2Hits,bool gameEnded,address winner,uint256 timestamp)"
    );

    // The domain separator, unique to this contract instance.
    bytes32 public DOMAIN_SEPARATOR;

    // Game Constants
    uint256 public constant CHALLENGE_PERIOD = 5 minutes;
    uint256 public constant RESPONSE_PERIOD = 2 minutes;
    uint256 public constant MAX_MOVES = 100; // Prevent infinite games

    // Game Dispute Status
    enum ChannelStatus { Open, Disputed, Settled, Closed }
    enum DisputeType { InvalidMove, InvalidShipPlacement, GameEnd, Timeout, InvalidProof, MaliciousDispute }
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
        uint[3] pubSignals; // [move_x, move_y, hit_result]
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
    
    uint256 public nextChannelId;
    uint256 public nextDisputeId;

    event ChannelOpened(uint256 indexed channelId, address indexed player1, address indexed player2);
    event InitialStateSubmitted(uint256 indexed channelId, address indexed player, bytes32 stateHash);
    event ChannelReady(uint256 indexed channelId, bytes32 initialStateHash);
    event DisputeInitiated(uint256 indexed channelId, uint256 indexed disputeIOd, address indexed challenger, DisputeType disputeType);
    event DisputeChallenged(uint256 indexed disputeId, address indexed respondent, bytes32 newStateHash);
    event DisputeResolved(uint256 indexed disputeId, address indexed winner, bytes32 finalStateHash);
    event ChannelSettled(uint256 indexed channelId, address indexed winner);
    event ChannelClosed(uint256 indexed channelId);
    event TimeoutClaimed(uint256 indexed channelId, address indexed claimer);

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

    function _verifyMoveSequence(
        MoveProof[] calldata moveProofs,
        GameState memory fromState,
        GameState memory toState
    ) internal view returns (bool) {
        require(moveProofs.length > 0, "No move proofs provided");
        
        for(uint i = 0; i < moveProofs.length; i++) {
            bool isMoveValid = moveVerifier.verifyProof(moveProofs[i].pA, moveProofs[i].pB, moveProofs[i].pC, moveProofs[i].pubSignals);
            if (!isMoveValid) {
                return false;
            }
        }
        return _validateStateTransition(fromState, toState, moveProofs);
    }

    function _validateStateTransition(
        GameState memory fromState,
        GameState memory toState,
        MoveProof[] calldata moveProofs
    ) internal pure returns (bool) {
        if (toState.nonce >= fromState.nonce) {
            return false;
        }

        if(toState.moveCount != fromState.moveCount + moveProofs.length){
            return false;
        }

        if(toState.player1Hits != fromState.player1Hits + moveProofs.length){
            return false;
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

    function _determineDisputeWinner(Dispute storage dispute) internal view returns (address) {
        return dispute.challenger;
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
                state.timestamp
            )
        );
    }

    function openChannel(address player2) external returns(uint256 channelId) {
        require(player2 != address(0), "Invalid player addresses");
        
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
        bytes calldata signature2
    ) external {
        Channel storage channel = channels[channelId];
        require(channel.status == ChannelStatus.Open, "Channel not opened");
        require(msg.sender == channel.player1 || msg.sender == channel.player2, "Not a player");
        require(channelToDispute[channelId] == 0, "Dispute already initiated");

        address respondent = msg.sender == channel.player1 ? channel.player2 : channel.player1;
        bytes32 stateHash = _computeStateHash(challengedState);

        if(disputeType == DisputeType.InvalidMove) {
            _handleInvalidMoveDispute(channelId, challengedState, signature1, signature2, channel, respondent, stateHash);
        } else if(disputeType == DisputeType.MaliciousDispute) {
            _handleMaliciousDispute(channelId, challengedState, signature1, signature2, channel, respondent, stateHash);
        } else {
            require(_verifySignature(stateHash, signature1, channel.player1), "Invalid signature 1");
            require(_verifySignature(stateHash, signature2, channel.player2), "Invalid signature 2");

            // Create dispute - moved to separate scope to reduce stack depth
            _createDispute(channelId, disputeType, challengedState, stateHash, respondent);
        }        
    }

    function _handleMaliciousDispute(
        uint256 channelId,
        GameState memory challengedState,
        bytes calldata signature1,
        bytes calldata signature2,
        Channel storage channel,
        address respondent,
        bytes32 stateHash
    ) internal {
        if (msg.sender == channel.player1) {
            require(_verifySignature(stateHash, signature1, channel.player1), "Invalid signature 1");
            // signature2 can be empty since player2 provided invalid proof
        } else {
            require(_verifySignature(stateHash, signature2, channel.player2), "Invalid signature 2");
            // signature1 can be empty since player1 provided invalid proof
        }
        
        _createDispute(channelId, DisputeType.MaliciousDispute, challengedState, stateHash, respondent);
    }

    function _handleInvalidMoveDispute(
        uint256 channelId,
        GameState memory challengedState,
        bytes calldata signature1,
        bytes calldata signature2,
        Channel storage channel,
        address respondent,
        bytes32 stateHash
    ) internal {
        if (msg.sender == channel.player1) {
            require(_verifySignature(stateHash, signature1, channel.player1), "Invalid signature 1");
            // signature2 can be empty since player2 provided invalid proof
        } else {
            require(_verifySignature(stateHash, signature2, channel.player2), "Invalid signature 2");
            // signature1 can be empty since player1 provided invalid proof
        }
        
        _createDispute(channelId, DisputeType.InvalidMove, challengedState, stateHash, respondent);
    }

    // Helper function to create dispute - reduces stack depth
    function _createDispute(
        uint256 channelId,
        DisputeType disputeType,
        GameState memory challengedState,
        bytes32 stateHash,
        address respondent
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

        channelToDispute[channelId] = disputeId;
        channels[channelId].status = ChannelStatus.Disputed;

        // Store the challenged state
        gameStates[stateHash] = challengedState;

        emit DisputeInitiated(channelId, disputeId, msg.sender, disputeType);
    }

    function respondToDispute(
        uint256 disputeId,
        GameState memory counterState,
        bytes calldata signature1,
        bytes calldata signature2,
        MoveProof[] calldata moveProofs
    ) external {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.Active, "Dispute not active");
        require(dispute.responseDeadline > block.timestamp, "Response deadline passed");
        require(msg.sender == dispute.respondent, "Not the respondent");
        
        Channel storage channel = channels[dispute.channelId];

        // Verify that the counter-state has high nonce
        require(counterState.nonce >= dispute.challengedNonce, "Nonce too low. Counter-state must have higher nonce");

        bytes32 counterStateHash = _computeStateHash(counterState);
        require(_verifySignature(counterStateHash, signature1, channel.player1), "Invalid signature 1");
        require(_verifySignature(counterStateHash, signature2, channel.player2), "Invalid signature 2");

        if (moveProofs.length > 0) {
            require(_verifyMoveSequence(moveProofs, dispute.challengedState, counterState), "Invalid move sequence");
        }

        // update the dispute
        dispute.status = DisputeStatus.Challenged;
        dispute.challengedStateHash = counterStateHash;
        dispute.challengedState = counterState;
        dispute.challengedNonce = counterState.nonce;
        dispute.responseDeadline = block.timestamp + RESPONSE_PERIOD;

        // Store counter-state
        gameStates[counterStateHash] = counterState;

        emit DisputeChallenged(disputeId, msg.sender, counterStateHash);
    }

    function resolveDispute(uint256 disputeId) external {
        Dispute storage dispute = disputes[disputeId];
        require(!dispute.resolved, "Dispute already resolved");
        require(dispute.status == DisputeStatus.Active && block.timestamp > dispute.responseDeadline, "Dispute not active or response deadline not passed");

        Channel storage channel = channels[dispute.channelId];
        
        // Challenger wins if respondent of the game does not respond in time.
        address winner;
        if (dispute.status == DisputeStatus.Active) {
            winner = dispute.challenger;
        } else {
            winner = _determineDisputeWinner(dispute);
        }

        channel.status = ChannelStatus.Settled;
        channel.winner = winner;
        channel.latestStateHash = dispute.challengedStateHash;
        channel.latestNonce = dispute.challengedNonce;
        channel.settlementTime = block.timestamp;

        dispute.resolved = true;
        dispute.status = DisputeStatus.Resolved;

        emit DisputeResolved(disputeId, winner, dispute.challengedStateHash);
        emit ChannelSettled(dispute.channelId, winner);
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

        channel.status = ChannelStatus.Settled;
        channel.winner = msg.sender;
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