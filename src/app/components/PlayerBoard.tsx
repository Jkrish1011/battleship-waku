"use client"
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Player, Message } from "../types";

import { BOARD_SIZE, createBoard, Ship, SHIPS, ChatMessage, MoveReplyMessage } from "../utils/gameUtils";
import { useLightPush } from "@waku/react";
import { BattleshipGameGenerator } from "./helpers/gameGenerator";
import { getContract } from "../utils/gameUtils";
import battleshipWakuAbi from "./../abi/BattleshipWaku.json" assert { type: "json" };
import useWallet from "../store/useWallet";
import Image from "next/image";
import { toast } from "react-toastify";

function PlayerBoard(props: { 
  latestMessage?: Message,
  player: Player,
  node: any,
  isLoading: boolean,
  error: any,
  encoder: any,
  roomId: string,
  joinedOrCreated: string,
  gameId?: string,
  opponentProofs?: Message | null
}) {
  const {node, encoder, isLoading, player, latestMessage, roomId, joinedOrCreated, gameId, opponentProofs} = props;
  const [wasmBuffer, setWasmBuffer] = useState<Uint8Array|null>(null);
  const [isReadyToPlay, setIsReadyToPlay] = useState(false);
  const [zkeyBuffer, setZkeyBuffer] = useState<Uint8Array|null>(null);
  const {address} = useWallet() as {address: string | null};
  const [board, setBoard] = useState(createBoard());
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
  const [shipPlacement, setShipPlacement] = useState<number[][]>([]);
  const [ships, setShips] = useState<Ship[]>(SHIPS);
  const router = useRouter();
  const [isLoadingProof, setIsLoadingProof] = useState(false);
  const [txDetails, setTxDetails] = useState<any>(null);
  const [txError, setTxError] = useState<string|null>(null);
  const [proofPlayer, setProofPlayer] = useState<any>(null);
  const [calldataPlayer, setCalldataPlayer] = useState<any>(null);
  const [verificationJson, setVerificationJson] = useState<string|null>(null);
  
  const doesShipExistOn = (rowIndex: number, colIndex: number, board: number[][]) => {
    return Boolean(board[rowIndex][colIndex])
  }

  const handleLatestMessage = async (_message: Message) => {
    // 1. Check if the sender is not the same as the player - because we only need to handle opponent's moves.
    // 2. If message has a move, we need to calculate if the move was a hit.
    
    if(_message.sender == player) {
      return;
    }

    if(!_message.move) {
      return;
    }
    const rowIndex = parseInt(_message.move.split(',')[0]);
    const colIndex = parseInt(_message.move.split(',')[1]);
    let hitOrMissFlag = doesShipExistOn(rowIndex, colIndex, board);
    if(hitOrMissFlag) {
      let newBoard = [...board];
      newBoard[rowIndex][colIndex] = 'X';
      setBoard(newBoard);
    }

    const hitOrMiss = hitOrMissFlag? "hit":"miss";

    // Create a new MoveReplyMessage
    // Send this message to the opponent board
    await sendMoveReplyMessage(hitOrMiss);
  }
  
  useEffect(() => {
    if(latestMessage){
      handleLatestMessage(latestMessage);
    }
  },[latestMessage]);

  useEffect(() => {
    // browser fetches them as static assets
    Promise.all([
      fetch("/shipPlacement/ship_placement.wasm").then(r => r.arrayBuffer()).then(buffer => new Uint8Array(buffer)),
      fetch("/shipPlacement/ship_placement_final.zkey").then(r => r.arrayBuffer()).then(buffer => new Uint8Array(buffer)),
      fetch("/shipPlacement/ship_verification_key.json").then(r => r.json()),
    ])
    .then(([wasm, zkey, verificationJson]) => {
      setWasmBuffer(wasm);
      setZkeyBuffer(zkey);
      setVerificationJson(verificationJson);
    })
    .catch(err => {
      console.error("failed to load wasm or zkey:", err);
    });
  }, []);

  useEffect(() => {
    if (!isLoading) {
      sendMessage(player, 'joined');
    }
  }, [isLoading]);

  const { push } = useLightPush({node, encoder});

  const verifyProofs = async () => {
    const gameGenerator = new BattleshipGameGenerator();
    await gameGenerator.initialize();
    const isValid = await gameGenerator.verifyProof(verificationJson, proofPlayer);
    console.log("isValid", isValid);
    if(isValid) {
      toast.success("Proof verified");
    } else {
      toast.error("Proof verification failed");
    }
    return isValid;
  }

  const sendReadyToPlay = async () => {
    if(!areAllShipsPlaced()) {
      alert('Please place all ships before sending ready to play message');
      return;
    }
    if(!calldataPlayer) {
      alert('Please generate board proof before sending ready to play message');
      return;
    }
    await joinGame();
    await sendMessage(player, 'ready');
  }

  const joinGame = async () => {
    if(!areAllShipsPlaced()) {
      alert('Please place all ships before joining game');
      return;
    }

    let tx;
    setTxDetails(null);
    setTxError(null);
    try{
      const gameGenerator = new BattleshipGameGenerator();
      await gameGenerator.initialize();
      const battleshipWaku = await getContract(process.env.NEXT_PUBLIC_BATTLESHIP_CONTRACT_ADDRESS as string, battleshipWakuAbi.abi);
      const userAddress = address;
      
      if(joinedOrCreated === "created") {
        let _gameId = gameId;
        if(!_gameId) {
          _gameId = gameGenerator.randomBytesCrypto(32);
        } else {
          _gameId = gameId;
        }
      tx = await battleshipWaku.createGame(userAddress, calldataPlayer, _gameId, roomId, {
        gasLimit: 5000000
      });
      } else {
        console.log("joining game");
        tx = await battleshipWaku.JoinGame(userAddress, calldataPlayer, gameId, {
          gasLimit: 5000000
        });
      }
      setTxDetails({ hash: tx.hash, status: 'pending' });
      await tx.wait();
      setTxDetails({ hash: tx.hash, status: 'confirmed' });
    }catch(error: any){
      setTxError(error?.message || 'Proof generation or transaction error');
      setTxDetails(null);
      console.error('Error joining game:', error);
    }
  }

  const generateBoardProof = async () => {
    if(!areAllShipsPlaced()) {
      alert('Please place all ships before generating board proof');
      return;
    }

    setIsLoadingProof(true);
    try {
      const gameGenerator = new BattleshipGameGenerator();
      await gameGenerator.initialize();
      const correctInput = await gameGenerator.generateCorrectInput(shipPlacement);
      const {proof: _proofPlayer, calldata: _calldataPlayer} = await gameGenerator.generateProof(correctInput, wasmBuffer as Uint8Array, zkeyBuffer as Uint8Array);
      setProofPlayer(_proofPlayer);
      setCalldataPlayer(_calldataPlayer);
    } catch (error: any) {
      setTxError(error?.message || 'Proof generation or transaction error');
      console.error('Proof generation error:', error);
    } finally {
      setIsLoadingProof(false);
      setIsReadyToPlay(true);
    }
  }

  const respondToMove = async (move:string) => {
    const rowIndex = parseInt(move.split(',')[0]);
    const colIndex = parseInt(move.split(',')[1]);

    if (doesShipExistOn(rowIndex, colIndex, board)) {
        console.log(" opponent hit a ship")
        let newBoard = [...board];
        newBoard[rowIndex][colIndex] = 'X';
        setBoard(newBoard);
        return;
    }

    console.log("opponent missed");
  }

  const handleReset = () => {
    setShips(SHIPS);
    setSelectedShip(null);
    setBoard(createBoard());
    setShipPlacement([]);
  };

  const handleShipSelection = (ship: Ship) => {
    if (!ship.placed) {
      setSelectedShip(ship);
    }
  };

  const areAllShipsPlaced = () => {
      // get a count of all placed ships
      const placedShips = ships.filter((_ship: Ship) => _ship.placed);
      return placedShips.length === SHIPS.length;
  }

  const resetShipPlacement = (shipId: number) => {
    const newBoard = createBoard();
    // Reset the board without the reset ship
    ships.forEach((ship) => {
      if (ship.id !== shipId && ship.placed) {
        // Re-place each ship except the reset one
        // Similar logic as placeShipOnBoard but without user interaction
      }
    });
    setBoard(newBoard);
    // Mark the reset ship as not placed
    setShips(
      ships.map((ship) =>
        ship.id === shipId ? { ...ship, placed: false } : ship
      )
    );
  };

  const placeShipOnBoard = (rowIndex: number, colIndex: number) => {
    if (!selectedShip) return;

    const newBoard = [...board];
    let canPlace = true;

    // Check if the ship can be placed
    for (let i = 0; i < selectedShip.size; i++) {
      if (selectedShip.orientation === "horizontal") {
        if (
          colIndex + i >= BOARD_SIZE ||
          newBoard[rowIndex][colIndex + i] !== 0
        ) {
          canPlace = false;
          break;
        }
      } else {
        if (
          rowIndex + i >= BOARD_SIZE ||
          newBoard[rowIndex + i][colIndex] !== 0
        ) {
          canPlace = false;
          break;
        }
      }
    }

    if (canPlace) {
      for (let i = 0; i < selectedShip.size; i++) {
        if (selectedShip.orientation === "horizontal") {
          newBoard[rowIndex][colIndex + i] = 1; // Mark ship cells with 1
        } else {
          newBoard[rowIndex + i][colIndex] = 1;
        }
      }
      setBoard(newBoard);

      // Mark the ship as placed
      const newShips = ships.map((ship) =>
        ship.id === selectedShip.id ? { ...ship, placed: true } : ship
      );
      setShipPlacement(prev => [...prev, [rowIndex, colIndex, selectedShip.size, selectedShip.orientation === "horizontal" ? 1 : 0]]);
      setShips(newShips);
      setSelectedShip(null); // Clear selection
    }
  };

  // This is the function which will sent the message betweent the players in real time.
  const sendMessage = async (sender: string, message: string) => {
    /*
      1/ Create a message
      2/ Serialize the message
      3/ Use push functionality to send the message
    */

      // 1/ create message
      const newMessage = ChatMessage.create({
        timestamp: Date.now(),
        message,
        sender,
        id: crypto.randomUUID()
      });

      // 2/ Serialize message
      const serializedMessage = ChatMessage.encode(newMessage).finish();

      // 3/ Push Message
      if (push) {
        const pushRes = await push({
          timestamp: new Date(),
          payload: serializedMessage
        });
        // console.log({pushRes});

        if (!pushRes) {
          alert('unable to connect to a stable node. please reload the page!');
        }
      }
  }

  const sendMoveReplyMessage = async (hit: string) => {
    /*
      1/ Create a message
      2/ Serialize the message
      3/ Use push functionality to send the message
    */

      // 1/ create message
      const newMessage = MoveReplyMessage.create({
        timestamp: Date.now(),
        hit:hit,
        sender: player,
        id: crypto.randomUUID()
      });

      // 2/ Serialize message
      const serializedMessage = MoveReplyMessage.encode(newMessage).finish();

      // 3/ Push Message
      if (push) {
        const pushRes = await push({
          timestamp: new Date(),
          payload: serializedMessage
        });
        // console.log({pushRes});

        if (!pushRes) {
          alert('unable to connect to a stable node. please reload the page!');
        }
      }
  }

  return (
    <>
    <div className="relative">
      { isLoadingProof && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-40 w-full">
          <Image src={`/shooting${joinedOrCreated === "created" ? "1" : "2"}.webp`} alt="Loading..." width={420} height={320} priority />
          <span className="text-white mt-4 font-bold text-lg">Generating proof and sending transaction...</span>
        </div>
      )}
      <div className={`grid grid-cols-2 gap-4 ${isLoadingProof ? 'pointer-events-none opacity-50' : ''}`}> 
        <div className="flex flex-col items-center space-y-2 mt-4">
          {ships
            .filter((ship) => !ship.placed)
            .map((ship) => (
              <button 
                key={ship.id} 
                onClick={() => handleShipSelection(ship)}
                className="px-4 py-2 bg-blue-500 text-white font-bold rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                >
                Ship {ship.id} (Size: {ship.size}, {ship.orientation})
              </button>
            ))}
        </div>
        <div className="flex flex-col items-center space-y-2 mt-4">
          <div className="board">
            {board.map((row, rowIndex) => (
              <div key={rowIndex} className="row">
                {row.map((cell, colIndex) => (
                  <div
                    key={colIndex}
                    className={`cell ${cell === 1 ? "ship" : ""}`}
                    onClick={() => {
                      if (cell === 1) resetShipPlacement(rowIndex);
                      else placeShipOnBoard(rowIndex, colIndex);
                    }}
                  >
                    {cell === 'X' && 'X'}
                  </div>
                ))}
              </div>
            ))}
            <div className="flex flex-col justify-center items-center w-full py-4 gap-4">
              <button 
                onClick={handleReset}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
                >
                Reset Board
              </button>
              <button
                onClick={generateBoardProof}
                className={`px-6 py-2 font-bold rounded transition-colors duration-150 ${
                  areAllShipsPlaced() ? 'bg-green-500 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50' : 'bg-gray-500 text-gray-200 cursor-not-allowed'}`}
                
              >
                Generate Board Proof
              </button>
              <button
                onClick={sendReadyToPlay}
                className={`px-6 py-2 font-bold rounded transition-colors duration-150 ${
                  isReadyToPlay ? 'bg-green-500 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50' : 'bg-gray-500 text-gray-200 cursor-not-allowed'}`}
                
              >
                Ready to play
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Proof container */}
      {calldataPlayer && (
      <div id="proof-container" className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="space-y-4">
          <h3 className="font-bold mb-2">Your Board Proof</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proof</label>
            <textarea id="proof" className="w-full h-40 p-3 bg-gray-100 rounded font-mono text-sm resize-y" readOnly>
              {
                (() => {
                  const _p = {
                    pA: calldataPlayer[0].toString(),
                    pB: calldataPlayer[1].toString(),
                    pC: calldataPlayer[2].toString(),
                    publicInput: calldataPlayer[3].toString(),
                  };
                  return JSON.stringify(_p, null, 2);
                })()
              }
            </textarea>
          </div>
          <button id="verifyProofs" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors" onClick={verifyProofs}>
            Verify Proof In-Browser
          </button>
        </div>
      </div>
      )}
      {opponentProofs && (
      <div id="proof-container" className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="space-y-4">
          <h3 className="font-bold mb-2">Opponent Board Proof</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proof</label>
            <textarea id="proof" className="w-full h-40 p-3 bg-gray-100 rounded font-mono text-sm resize-y" readOnly>
              {
                (() => {
                  return JSON.stringify(opponentProofs, null, 2);
                })()
              }
            </textarea>
          </div>
          <button id="verifyProofs" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors">
            Verify Proof In-Browser
          </button>
        </div>
      </div>
      )}
      {/* Transaction details section */}
      <div className="mt-6 p-4 bg-gray-100 rounded shadow">
        <h3 className="font-bold mb-2">Transaction Details</h3>
        {txError && <div className="text-red-600">Error: {txError}</div>}
        {txDetails ? (
          <div>
            <div><span className="font-semibold">Tx Hash:</span> <span className="break-all">{txDetails.hash}</span></div>
            <div><span className="font-semibold">Status:</span> {txDetails.status}</div>
          </div>
        ) : (
          <div className="text-gray-500">No transaction yet.</div>
        )}
      </div>
    </div>
    </>
  );
}

export default PlayerBoard;