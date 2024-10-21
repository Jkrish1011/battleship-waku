'use client'
import React from "react";

import PlayerBoard from "./PlayerBoard";
import { Player } from "../types";
import OpponentBoard from "./OpponentBoard";
import { useContentPair, useFilterMessages, useWaku } from "@waku/react";


const Container = (props: {
    player: Player
}) => {

    const {player} = props;

    // This provides the node which we will use for the communication.
    const { node, isLoading, error} = useWaku();

    // Provides the utility to decode and encode the messages from waku.
    const {decoder, encoder} = useContentPair();

    // Array of all the messages which are sent over the content topic(particular to this example)
    const {messages:filterMessages} = useFilterMessages({node, decoder});
    return (
        <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col">
            <h1 className="text-lg font-bold text-center">
                Your Board
            </h1>
            <PlayerBoard 
                player={player} 
                node={node}
                isLoading={isLoading}
                error={error}
                encoder={encoder}
            />


            
            <div className="grid grid-cols-1 gap-4">
                <h1 className="text-lg font-bold text-center">
                    Opponent Board
                </h1>

                <OpponentBoard player={player} />
            </div>

        </div>

        
    

        <div style={{width: '300px'}} className=" mx-auto my-4 p-4 bg-gray-800 text-white rounded-lg shadow">

        <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">Messages:</h3>

        <ul className="space-y-2 overflow-y-auto max-h-64">

                
        </ul>
        </div>
        </div>
    )
}

export default Container;