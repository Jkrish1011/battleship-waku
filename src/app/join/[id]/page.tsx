// @ts-nocheck
'use client'
import { useParams, useSearchParams } from "next/navigation";
import { ContentPairProvider } from "@waku/react";
import { useEffect, useState } from "react";
import Container from "../../components/Container";
import { Player } from "../../types";
import Navbar from "../../components/NavBar";

const Page = () => {
    const searchParams = useParams();
    const queryParams = useSearchParams();
    const username = queryParams.get('username');
    const gameId = queryParams.get('gameId');
    const roomId = searchParams.id as string;
    const [contentTopic, setContentTopic] = useState('');

    useEffect(() => {
        console.log({roomId});
        const _contentTopic = `/waku-battle-ship-tutorial-${roomId}/1/private-message/proto`;
        setContentTopic(_contentTopic);
    }, [roomId]);

    return (
        // <ContentPairProvider contentTopic={`/waku-battle-ship-tutorial-${roomId}/1/private-message/proto`}>
        <>
        <Navbar />
        <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
            <div className="text-lg font-bold text-center">
                Welcome, <span className="text-green-500">{username}</span> <br />
                you have joined the room <span className="text-blue-500"> {roomId} </span>
            </div>
            <Container player={Player.p2} roomId={roomId} joinedOrCreated="joined" gameId={gameId} contentTopic={contentTopic} />
        </div>
        </>
        // </ContentPairProvider>
    )
};

export default Page;