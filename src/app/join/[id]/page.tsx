'use client'
import { useParams, useSearchParams } from "next/navigation";
import { ContentPairProvider } from "@waku/react";
import React from "react";
import Container from "../../components/Container";
import { Player } from "../../types";

const Page = () => {
    const searchParams = useParams();
    const queryParams = useSearchParams();
    const username = queryParams.get('username');
    const roomId = searchParams.id as string;

    return (
        <ContentPairProvider contentTopic={`/waku-battle-ship-tutorial-${roomId}/1/private-message/proto`}>
        <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
            <div className="text-lg font-bold text-center">
                Welcome, <span className="text-green-500">{username}</span> <br />
                you have joined the room <span className="text-blue-500"> {roomId} </span>
            </div>
            <Container player={Player.p2} />
        </div>
        </ContentPairProvider>
    )
};

export default Page;