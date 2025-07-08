// @ts-nocheck

'use client'

import React, { useState, useEffect } from "react";

import PlayerBoard from "./PlayerBoard";
import { Player, Message } from "../types";
import OpponentBoard from "./OpponentBoard";
import { useContentPair, useFilterMessages, useWaku } from "@waku/react";
import { Ship } from "../utils/gameUtils";
import { decodeMessage, isGameReady , Ship} from "../utils/gameUtils";
import Spinner from "./Spinner";
import { findLatestMessage } from "../utils";
import { useWallet } from "../store/useWallet";

const Container = (props: {
    player: Player,
    roomId?: string,
    joinedOrCreated: string,
    gameId?: string
}) => {

    const {player, roomId, joinedOrCreated, gameId} = props;
    const {address} = useWallet() as {address: string | null};
    const [messages, setMessages] = useState<Message[]>();
    const [latestMessage, setLatestMessage] = useState<Message>();
    const [opponentProofs, setOpponentProofs] = useState<Message>();
    const [opponentCalldataProofs, setOpponentCalldataProofs] = useState<Message>();
    const [localShips, setLocalShips] = useState<Ship[]>();
    // This provides the node which we will use for the communication.
    const { node, isLoading, error} = useWaku();

    // Provides the utility to decode and encode the messages from waku.
    const {decoder, encoder} = useContentPair();

    // Array of all the messages which are sent over the content topic(particular to this example)
    
    const {messages: filterMessages} = useFilterMessages({node, decoder});

    useEffect(() => {
        // 1. Define a decodeMessage function
        // 2. Map over filterMessages using decodeMessage function
        const decodedMessages = filterMessages.map((item) => decodeMessage(item, ''));
        console.log(decodedMessages);
        if(decodedMessages) {
            setMessages(decodedMessages as Message[]);
            const _latestMessage = findLatestMessage(decodedMessages as Message[]);
            console.log(_latestMessage?.sender);
            console.log({player});
            // If the latest message is not from the sender itself, do not process. Only process from the opponent.
            if(_latestMessage?.sender.toString().toLowerCase() !== player.toString().toLowerCase() ) {
                if(_latestMessage?.proof) {
                    console.log("Setting opponent proofs!");
                    setOpponentProofs(JSON.parse(_latestMessage.proof));
                } else if (_latestMessage?.calldata) {
                    setOpponentCalldataProofs(JSON.parse(_latestMessage.calldata));
                } else if(_latestMessage?.message || _latestMessage?.move || _latestMessage?.hit) {
                    setLatestMessage(_latestMessage);
                }
            }
        }
    }, [filterMessages]);

    useEffect(() => {
        console.log(`ships_${roomId}`);
        const _ships = localStorage.getItem(`ships_${roomId}`) || null;
        console.log(_ships);
        if(_ships !== '' && _ships !== undefined && _ships !== null) {
            setLocalShips(JSON.parse(_ships));
        }
    }, []);

    if (isLoading) {
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
                    node={node}
                    isLoading={isLoading}
                    error={error}
                    encoder={encoder}
                    roomId={roomId || ''}
                    joinedOrCreated={joinedOrCreated}
                    gameId={gameId}
                    opponentProofs={opponentProofs}
                    opponentCalldataProofs={opponentCalldataProofs}
                    localShips={localShips}
                />

                {
                    // 1. Hide the opponent board until both players are ready.
                    // Define function to check if players are ready.
                    messages && isGameReady(messages) && 
                    <div className="grid grid-cols-1 gap-4">
                        <h1 className="text-lg font-bold text-center">
                            Opponent Board
                        </h1>
                        <OpponentBoard player={player} encoder={encoder} node={node} latestMessage={latestMessage} roomId={roomId} />
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