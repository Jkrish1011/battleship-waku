// @ts-nocheck
import { Message, Player } from "../types";
import protobuf from "protobufjs";
import { ethers } from "ethers";

const isGameReady = (gameMessages: Message[]): boolean => {
  // return true;

  const gameMessagesCleaned = gameMessages.map((_gameMessage: Message) => ({
    sender: _gameMessage.sender,
    message: _gameMessage.message,
  }));

  const playerP1Ready = gameMessagesCleaned.some(
    (event) => event.sender === "p1" && event.message === "ready"
  );

  const playerP2Ready = gameMessagesCleaned.some(
    (event) => event.sender === "p2" && event.message === "ready"
  );

  return playerP1Ready && playerP2Ready;
};

export type Ship = {
  id: number;
  size: number;
  orientation: string;
  placed: boolean;
  x: number;
  y: number;
};

export type ShipPlacement = {
  start_x: number;
  start_y: number;
  length: number;
  orientation: number;
};

const BOARD_SIZE = 10;

const createBoard = () =>
  Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0)); // Fill with 0 for empty cells

const SHIPS: Ship[] = [
  { id: 1, size: 3, orientation: "horizontal", placed: false, x: 0, y: 0 },
  { id: 2, size: 3, orientation: "horizontal", placed: false, x: 0, y: 0 },
  { id: 3, size: 2, orientation: "horizontal", placed: false, x: 0, y: 0 },
  { id: 4, size: 2, orientation: "vertical", placed: false, x: 0, y: 0 },
  { id: 5, size: 2, orientation: "vertical", placed: false, x: 0, y: 0 },
];

// Creating the chat message in a way the waku protocol can understand.
const ChatMessage = new protobuf.Type("ChatMessage")
  .add(new protobuf.Field("timestamp", 1, "uint64"))
  .add(new protobuf.Field("sender", 2, "string"))
  .add(new protobuf.Field("message", 3, "string"))
  .add(new protobuf.Field("id", 4, "string"));

const MoveMessage = new protobuf.Type("MoveMessage")
  .add(new protobuf.Field("timestamp", 1, "uint64"))
  .add(new protobuf.Field("sender", 2, "string"))
  .add(new protobuf.Field("move", 5, "string")) // type::[row,col]
  .add(new protobuf.Field("id", 4, "string"));

const MoveReplyMessage = new protobuf.Type("MoveReplyMessage")
  .add(new protobuf.Field("timestamp", 1, "uint64"))
  .add(new protobuf.Field("sender", 2, "string"))
  .add(new protobuf.Field("hit", 6, "string")) // hit/miss
  .add(new protobuf.Field("moveProof", 9, "string")) 
  .add(new protobuf.Field("id", 4, "string"));

const BoardProofMessage = new protobuf.Type("BoardProofMessage")
  .add(new protobuf.Field("timestamp", 1, "uint64"))
  .add(new protobuf.Field("sender", 2, "string"))
  .add(new protobuf.Field("proof", 7, "string"))
  .add(new protobuf.Field("id", 4, "string"));

const BoardProofCalldataMessage = new protobuf.Type("BoardProofCalldataMessage")
  .add(new protobuf.Field("timestamp", 1, "uint64"))
  .add(new protobuf.Field("sender", 2, "string"))
  .add(new protobuf.Field("calldata", 8, "string"))
  .add(new protobuf.Field("id", 4, "string"));

const decodeMessage = (wakuMessage: any) => {
  if (!wakuMessage.payload) {
    console.log("No payload found!");
    return {};
  }
  try {
    const { timestamp, sender, message, id } = ChatMessage.decode(
      wakuMessage.payload
    );
    if (message) {
      return { timestamp, sender, message, id };
    } else {
      const { timestamp, sender, move, id } = MoveMessage.decode(
        wakuMessage.payload
      );
      if (move) {
        return { timestamp, sender, move, id };
      } else {
        const { timestamp, sender, hit, moveProof, id } = MoveReplyMessage.decode(
          wakuMessage.payload
        );
        if(hit) {
          return { timestamp, sender, hit, moveProof, id };
        } else{
          var { timestamp, sender, proof, id } = BoardProofMessage.decode(
            wakuMessage.payload
          );
          if(proof) {
            return { timestamp, sender, proof, id };
          } else {
            var { timestamp, sender, calldata, id } = BoardProofCalldataMessage.decode(
              wakuMessage.payload
            );
            return { timestamp, sender, calldata, id };
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
};

const getContract = async (CONTRACT_ADDRESS: string, CONTRACT_ABI: any) => {
  try {
    // Validate contract address format
    if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
      throw new Error(`Invalid contract address: ${CONTRACT_ADDRESS}`);
    }

    // Check if MetaMask is available
    if (typeof window !== 'undefined' && window.ethereum) {
      // Use MetaMask provider
      const provider = new ethers.BrowserProvider(window.ethereum);
      
      // Request account access if not already connected
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
      } catch (error) {
        throw new Error('User rejected MetaMask connection request');
      }
      
      // Get signer from MetaMask
      const signer = await provider.getSigner();
      
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
    } else if (process.env.NEXT_PUBLIC_RPC_URL) {
      // Fallback to read-only provider if RPC_URL is provided
      console.warn('MetaMask not detected. Using read-only contract connection.');
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL as string);
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      
    } else {
      throw new Error('MetaMask not detected and no RPC_URL provided for fallback');
    }
    
  } catch (error) {
    console.error('Contract initialization failed:', error);
    throw error;
  }
};

const shorten = (content: string) => {
  return content.slice(0, 6) + "..." + content.slice(-4);
}

export {
  isGameReady,
  BOARD_SIZE,
  createBoard,
  SHIPS,
  ChatMessage,
  MoveMessage,
  MoveReplyMessage,
  BoardProofMessage,
  BoardProofCalldataMessage,
  decodeMessage,
  getContract,
  shorten,
};
