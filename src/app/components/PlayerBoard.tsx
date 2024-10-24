"use client"
import React, { useState, useEffect } from "react";

import { Player, Message } from "../types";

import { BOARD_SIZE, createBoard, Ship, SHIPS, ChatMessage, MoveReplyMessage } from "../utils/gameUtils";
import { useLightPush } from "@waku/react";

function PlayerBoard(props: { 
  latestMessage?: Message,
  player: Player,
  node: any,
  isLoading: boolean,
  error: any,
  encoder: any
}) {
  const {node, encoder, isLoading, player, latestMessage} = props;

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
    console.log(latestMessage);
    if(latestMessage){
      handleLatestMessage(latestMessage);
    }
  },[latestMessage]);

  useEffect(() => {
    if (!isLoading) {
      sendMessage(player, 'joined');
    }
  }, [isLoading]);

  const { push } = useLightPush({node, encoder});

  const sendReadyToPlay = async () => {
    await sendMessage(player, 'ready');
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

    console.log("opponent missed")
  

  }

  const [board, setBoard] = useState(createBoard());
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
  const [ships, setShips] = useState<Ship[]>(SHIPS);

  const handleReset = () => {

    setShips(SHIPS);
    setSelectedShip(null);
    setBoard(createBoard());
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

        if (pushRes?.errors?.length && pushRes?.errors?.length) {
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

        if (pushRes?.errors?.length && pushRes?.errors?.length) {
          alert('unable to connect to a stable node. please reload the page!');
        }
      }
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      
      
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
                className={`cell ${cell === 1 ? "ship" : ""}`} // Use 'ship' class for cells with a ship
                onClick={() => {
                  if (cell === 1) resetShipPlacement(rowIndex);
                  else placeShipOnBoard(rowIndex, colIndex);
                }}
              >
                {
                  cell === 'X' && 'X'
                }
              </div>
            ))}
          </div>
        ))}


      <div className="flex justify-between items-center w-full py-4">

<button 
  onClick={handleReset}
  className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"

  >
    
  reset
  </button>
  <button
    onClick={sendReadyToPlay}
    className={`px-6 py-2 font-bold text-lg rounded transition-colors duration-150 ${
      areAllShipsPlaced() ? 'bg-green-500 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50' : 'bg-gray-500 text-gray-200 cursor-not-allowed'}`}
  >
  Ready to play
  </button>
</div>
      </div>
      </div>

      
    </div>
  );
}

export default PlayerBoard;