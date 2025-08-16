// @ts-nocheck
'use client'

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Container from "../../components/Container";
import { Player } from "../../types";
import { ContentPairProvider } from "@waku/react";
import Navbar from "./../../components/NavBar";


const Page = () => {
    const [contentTopic, setContentTopic] = useState(null);
    const searchParams = useParams();
    const queryParams = useSearchParams();
    const username = queryParams.get('username');
    const roomId = searchParams.id as string;
    const gameId = queryParams.get('gameId');

    useEffect(() => {
        console.log({roomId});
        const _contentTopic = `/waku-battle-ship-tutorial-${roomId}/1/private-message/proto`;
        setContentTopic(_contentTopic);
    }, []);

    return (
        // contentTopic is the way waku distinguish the particular message from all the other messages being passed through the network.
        // Because in waku all nodes receive and transmit all message, we just need to filter the ones we require.
        // <ContentPairProvider contentTopic={`/waku-battle-ship-tutorial-${roomId}/1/private-message/proto`}>
        <>
            <Navbar />
            <div className="flex flex-col items-center justify-center min-h-screen space-y-4 pt-20">
            
            <div className="text-lg font-bold text-center">
                Welcome to room: <span className="text-blue-500">{searchParams.id}</span> created by <span className="text-green-500">{username}</span>
            </div>

            <div className="text-md text-gray-700 text-center">
                Share this room ID with your friend to start playing now
            </div>

            {contentTopic && (
                <Container player={Player.p1} roomId={roomId} joinedOrCreated="created" gameId={gameId} contentTopic={contentTopic} />
            )}
            </div>
        {/* </ContentPairProvider> */}
        </>
    )
}

export default Page;