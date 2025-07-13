
import React, { useState, useEffect } from "react";
import { Player, Message } from "../types";
import { createBoard, MoveMessage } from "../utils/gameUtils";
import { createWakuEncoder } from "@/app/WakuService";
import Image from "next/image";
import { toast } from "react-toastify";

const OpponentBoard = (props: {
    player: Player,
    node: any,
    latestMessage?: Message,
    roomId: string,
    joinedOrCreated: string,
    contentTopic: string
}) => {
    const {node, player, latestMessage, roomId, joinedOrCreated, contentTopic} = props;
    const [board, setBoard] = useState(createBoard());
    const [move, setMove] = useState<string>('');
    const [isLoadingProof, setIsLoadingProof] = useState(false);
    const encoder = createWakuEncoder(contentTopic);
    const handleHit = (hit: string) => {
      const newBoard = [...board];
      const rowIndex = parseInt(move.split(',')[0]);
      const colIndex = parseInt(move.split(',')[1]);
      newBoard[rowIndex][colIndex] = hit;
      setBoard(newBoard);
      localStorage.setItem(`board_${roomId}`, JSON.stringify(newBoard));
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

    // const { push } = useLightPush({node, encoder});

    const sendMoveMessage = async (rowIndex: any, colIndex: any) => {
      setIsLoadingProof(true);
      try{
        console.log("sending move message");
        setMove(`${rowIndex},${colIndex}`);
        
        const newMessage = MoveMessage.create({
          timestamp: Date.now(),
          sender: player,
          move: `${rowIndex},${colIndex}`,
          id: crypto.randomUUID()
        });

        const serializedMessage = MoveMessage.encode(newMessage).finish();

        const result = await node.lightPush.send(encoder, {
          payload: serializedMessage,
          timestamp: new Date(),
        }, { autoRetry: true });

        if (result.successes.length > 0) {
          console.log(`message sent successfully.`);
        } else {
          console.warn(`Failed to send message:`, result.failures);
        }

      }catch(error) {
        toast.error(`Failed to Send Message`);
        console.error(`Failed to send message:`, error);
      }finally {
        setIsLoadingProof(false);
      }
    }

    useEffect(() => {
      const _board = localStorage.getItem(`board_${roomId}`);
      if(_board !== null && _board !== undefined && _board !== '') {
        setBoard(JSON.parse(_board));
      }
    }, [roomId]);

    return (
      <div className="grid grid-cols-2 gap-4">
      {isLoadingProof && (
        <div className="absolute inset-0 z-50 flex items-center justify-center w-full h-[700px] backdrop-blur-sm bg-black/30">
          <div className="bg-white/80 rounded-xl shadow-2xl px-8 py-8 flex flex-col items-center min-w-[320px]">
            <div className="mb-4">
              {/* <svg className="animate-spin h-10 w-10 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg> */}
              <Image src={`/shooting${joinedOrCreated === "created" ? "1" : "2"}.webp`} alt="Loading..." width={420} height={320} priority />
            </div>
            <span className="text-gray-800 font-semibold text-lg mb-1">Missiles way!</span>
            <span className="text-gray-500 text-sm text-center">Please wait while we send the missiles… and generate the proof for you captian!</span>
          </div>
        </div>
      )}
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