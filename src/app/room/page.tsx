'use client'

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import useWallet from "../store/useWallet";
import { ethers } from "ethers";
import battleshipWakuAbi from "./../abi/BattleshipWaku.json" assert { type: "json" };

function generateThreeDigitNumber(): number {
    // Generate a number between 0 (inclusive) and 1 (exclusive),
    // multiply it by 900 to get a range of 0 to 899,
    // add 100 to shift the range to 100 to 999,
    // and use Math.floor to remove any decimal places.
    return Math.floor(Math.random() * 900 + 100);
  }

const Page = () => {
    const [username, setUsername] = useState<string>('');
    const [games, setGames] = useState<any[]>([]);
    const router = useRouter();
    const {address} = useWallet() as {address: string | null};

  
    const getContract = async (CONTRACT_ADDRESS: string, CONTRACT_ABI: any) => {
      try {
        const { ethereum } = window as any;
        if (!ethereum) throw new Error('MetaMask not found');
  
        // Validate contract address format
        if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
          throw new Error(`Invalid contract address: ${CONTRACT_ADDRESS}`);
        }

        // Connect to the user's MetaMask wallet
        const provider = new ethers.BrowserProvider(ethereum);
        const signer = await provider.getSigner();
        
        return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      } catch (error) {
        console.error('Contract initialization failed:', error);
        throw error;
      }
    };

    useEffect(() => {
      (async () => {
        console.log(process.env.NEXT_PUBLIC_BATTLESHIP_CONTRACT_ADDRESS);
        console.log(battleshipWakuAbi.abi);
        const contract = await getContract(process.env.NEXT_PUBLIC_BATTLESHIP_CONTRACT_ADDRESS as string, battleshipWakuAbi.abi);
        const games = await contract.getAllGames({
          gasLimit: 500000
        });
        let parsedGames: any[] = [];
        // If games is an array of arrays (each game is an array of values)
        if (Array.isArray(games) && games.length > 0) {
          parsedGames = games.map((game, index) => {
            console.log({game});
              if (Array.isArray(game)) {
                  return {
                      gameId: game[0],
                      player1: game[1],
                      player2: game[2],
                      isActive: game[3],
                      playerTurn: game[4],
                      player1_board_commitment: game[5],
                      player1_merkle_root: game[6],
                      player2_board_commitment: game[7],
                      player2_merkle_root: game[8],
                      wakuRoomId: game[11],
                      // Add the rest of the fields based on your GameView struct
                  };
              }
              return game;
          });
          console.log("Parsed games:", parsedGames);
        }
        setGames(parsedGames);
      })();
      
    }, []);

    return(
        <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
          <div className="flex flex-col items-center">
            <input
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Enter username"
              type="text"
              value={username}
              onChange={e => setUsername(e?.target?.value)}
            />
          </div>

          <div>
            <button
              className={`px-4 py-2 rounded-md text-white font-bold ${!Boolean(username) ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-700'}`}
              disabled={!Boolean(username)}
              onClick={() => {router.push(`/room/${generateThreeDigitNumber()}?username=${username}`)}}>
              Create a new room
            </button>
          </div>

          <div>
            {games.map((game) => (
              <div key={Math.random().toString()}>
                <h1>{game.player1}</h1>
                <h1>{game.gameId}</h1>
                <h1>{game.wakuRoomId}</h1>
                <button>Join</button>
              </div>
            ))}
          </div>
          {/* <div>
            <div className="text-center text-gray-500 my-2">
              OR
            </div>

            <div className="flex flex-col items-center">
              <input
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                type="text"
                value={room}
                onChange={e => setRoom(e?.target?.value)}
              />

              <button
                className={`mt-2 px-4 py-2 rounded-md text-white font-bold ${!Boolean(room) || !Boolean(username) ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-700'}`}
                disabled={!Boolean(room) || !Boolean(username)}
                onClick={() => {router.push(`/join/${room}?username=${username}`)}}>
                Join this room
              </button>
            </div>
          </div> */}
        </div>
    )
};

export default Page;