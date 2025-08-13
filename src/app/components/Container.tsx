'use client'

import React, { useState, useEffect } from "react";

import PlayerBoard from "./PlayerBoard";
import { Player, Message } from "../types";
import OpponentBoard from "./OpponentBoard";
import { decodeMessage, isGameReady , Ship} from "../utils/gameUtils";
import Spinner from "./Spinner";
import { useWaku } from "@/app/WakuProvider";
import { createWakuDecoder } from "@/app/WakuService";
import { DecodedMessage } from "@waku/sdk";

const Container = (props: {
    player: Player,
    roomId?: string,
    joinedOrCreated: string,
    gameId?: string,
    contentTopic: string
}) => {

    const {player, roomId, joinedOrCreated, gameId, contentTopic} = props;
    const [messages, setMessages] = useState<Message[]>();
    const [latestMessage, setLatestMessage] = useState<Message>({} as Message);
    const [opponentProofs, setOpponentProofs] = useState<Message>({} as Message);
    const [opponentCalldataProofs, setOpponentCalldataProofs] = useState<Message>({} as Message);
    const [opponentMoveProofs, setOpponentMoveProofs] = useState<Message[]>([]);
    const [opponentSignature, setOpponentSignature] = useState<Message>({} as Message);
    const [localShips, setLocalShips] = useState<Ship[]>();
    // This provides the node which we will use for the communication.
    const { wakuNode, peerId, loading, error } = useWaku();

    // Array of all the messages which are sent over the content topic(particular to this example

    useEffect(() => {
        console.log(`ships_${roomId}`);
        const _ships = localStorage.getItem(`ships_${roomId}`) || null;
        if(_ships !== '' && _ships !== undefined && _ships !== null) {
            setLocalShips(JSON.parse(_ships));
        }
    }, []);

    const subscribeToMessages = async () => {
        if (!contentTopic) {
            console.log("No content topic found!");
            return;
        }
        const decoder = createWakuDecoder(contentTopic);
        await wakuNode?.filter.subscribe(decoder, (wakuMessage: DecodedMessage) => { 
            console.log("Raw Waku message received, payload length:", wakuMessage.payload.length);
            const decodedMessage = decodeMessage(wakuMessage);
            
            if (decodedMessage) {    
                const _latestMessage = decodedMessage;
                // If the latest message is not from the sender itself, do not process. Only process from the opponent.
                if(_latestMessage?.sender.toString().toLowerCase() !== player.toString().toLowerCase() ) {
                    if(_latestMessage?.proof) {
                        setOpponentProofs(JSON.parse(_latestMessage.proof));
                    } else if (_latestMessage?.calldata) {
                        setOpponentCalldataProofs(JSON.parse(_latestMessage.calldata));
                    } else if(_latestMessage?.message || _latestMessage?.move) {
                        console.log("latest message received!");
                        console.log(_latestMessage);
                        setLatestMessage(_latestMessage as Message);
                    } else if(_latestMessage?.hit && _latestMessage?.moveProof) {
                        console.log("move proofs received!");
                        console.log(_latestMessage);
                        setOpponentMoveProofs(prevMessages => [...(prevMessages || []), _latestMessage]);
                    }
                    else if(_latestMessage?.signature) {
                        console.log("signature received!");
                        console.log(_latestMessage);
                        setOpponentSignature(_latestMessage);
                    }
                    setMessages(prevMessages => [...(prevMessages || []), _latestMessage]);
                } else if(_latestMessage?.message === "ready" || _latestMessage?.message === "joined") {
                    setMessages(prevMessages => [...(prevMessages || []), _latestMessage]);
                }
            } else {
                console.warn("Could not decode received Waku message. Payload might be malformed or not a ChatMessage.");
            }
        });
        console.log("Subscription active.");
      };


    useEffect(() => {
        subscribeToMessages();
    }, [wakuNode]);

    if (loading) {
        return <Spinner />
    }
    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
                <h1 className="text-lg font-bold text-center">
                    Your Board
                </h1>
                <PlayerBoard 
                    latestMessage={latestMessage}
                    player={player} 
                    node={wakuNode}
                    isLoading={loading}
                    error={error}
                    roomId={roomId || ''}
                    joinedOrCreated={joinedOrCreated}
                    gameId={gameId || ''}
                    opponentProofs={opponentProofs}
                    opponentCalldataProofs={opponentCalldataProofs}
                    opponentMoveProofs={opponentMoveProofs}
                    localShips={localShips}
                    contentTopic={contentTopic}
                    opponentSignature={opponentSignature}
                />

                {
                    // 1. Hide the opponent board until both players are ready.
                    // Define function to check if players are ready.
                    messages && isGameReady(messages) && 
                    <div className="grid grid-cols-1 gap-4">
                        <h1 className="text-lg font-bold text-center">
                            Opponent Board
                        </h1>
                        <OpponentBoard player={player} node={wakuNode} latestMessage={latestMessage} roomId={roomId} contentTopic={contentTopic} joinedOrCreated={joinedOrCreated} />
                    </div>
                }
            </div>

            <div style={{width: '300px'}} className=" mx-auto my-4 p-4 bg-gray-800 text-white rounded-lg shadow">
                <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">Messages:</h3>
                <ul className="space-y-2 overflow-y-auto max-h-50">
                    {
                        messages && messages.map((_message: Message, idx) => {
                            return (
                                <li key={idx} className={`flex items-center ${_message.sender === Player.p1? `justify-end`: `justify-start`}`}>
                                    <div className={`${_message.sender === Player.p1 ? 'bg-blue-500': 'bg-green-500'} text-sm text-white py-2 px-4 rounded-lg max-w-xs`}>
                                        <p className="font-bold">{_message.sender}</p>
                                        <p>{_message.move || _message.message }</p>
                                    </div>
                                </li>
                            )
                        })
                    }
                </ul>
            </div>
        </div>
    )
}

export default Container;