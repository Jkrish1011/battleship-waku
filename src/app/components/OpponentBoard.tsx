import React, { useState, useEffect } from "react";
import { Player, Message } from "../types";
import { createBoard, MoveMessage } from "../utils/gameUtils";
import { useLightPush } from "@waku/react";

const OpponentBoard = (props: {
    player: Player,
    node: any,
    encoder: any,
    latestMessage?: Message,
}) => {
    const {node, encoder, player, latestMessage} = props;

    const handleHit = (hit: string) => {
      const newBoard = [...board];
      const rowIndex = parseInt(move.split(',')[0]);
      const colIndex = parseInt(move.split(',')[1]);
      newBoard[rowIndex][colIndex] = hit;
      setBoard(newBoard);
    }

    const handlelatestMessage = async (latestMessage: Message) => {
      // 1. Check if the sender is not the same as the player - because we only need to handle opponent's moves.
      if(latestMessage.sender == player) {
        return;
      }

      if (!latestMessage.hit) {
        return;
      }

      if(latestMessage.hit){
        handleHit(latestMessage.hit);
      }
    }

    useEffect(() => {
      if(latestMessage) {
        handlelatestMessage(latestMessage);
      }
    }, [latestMessage]);

    const [board, setBoard] = useState(createBoard());
    const [move, setMove] = useState<string>('');
    
    const { push } = useLightPush({node, encoder});

    const sendMoveMessage = async (rowIndex: any, colIndex: any) => {
      console.log("sending move message");
      setMove(`${rowIndex},${colIndex}`)
      // 1/ create message
      const newMessage = MoveMessage.create({
        timestamp: Date.now(),
        sender: player,
        move: `${rowIndex},${colIndex}`,
        id: crypto.randomUUID()
      });

      // 2/ Serialize message
      const serializedMessage = MoveMessage.encode(newMessage).finish();

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
        <div></div>
          <div className="board">
            {
              board.map((row, rowIndex) => (
                <div key={rowIndex} className="row">
                  {
                    row.map((cell, colIndex) => (
                      <div
                        onClick={() => {sendMoveMessage(rowIndex, colIndex)}}
                        key={colIndex}
                        className={`cell ${cell === 1 ? "ship" : ""}`} // Use 'ship' class for cells with a ship
                      >
                          {
                            cell === 'hit' && (
                              <span role="img" aria-label="hit">🎯</span> // Replace with your hit icon
                            )
                          }
                          {
                            cell === 'miss' && (
                              <span role="img" aria-label="miss">💦</span> // Replace with your miss icon
                            )
                          }
                      </div>
                    ))
                  }
                </div>
            ))
          }
          </div>
        </div>
    )
}

export default OpponentBoard;