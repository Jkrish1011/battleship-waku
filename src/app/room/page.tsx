// @ts-nocheck
'use client'

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { useWallet } from "../store/useWallet";
import battleshipWakuAbi from "./../abi/BattleshipStateChannel.json" assert { type: "json" };
import { getContract, shorten } from "../utils/gameUtils";
import Navbar from "../components/NavBar";

// Define types
interface Window {
  ethereum?: any;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

function generateThreeDigitNumber(): number {
    // Generate a number between 0 (inclusive) and 1 (exclusive),
    // multiply it by 900 to get a range of 0 to 899,
    // add 100 to shift the range to 100 to 999,
    // and use Math.floor to remove any decimal places.
    return Math.floor(Math.random() * 900 + 100);
  }

const Page = () => {
    const [username, setUsername] = useState<string>('');
    const { address } = useWallet();
    const [games, setGames] = useState<any[]>([]);
    const router = useRouter();

    useEffect(() => {
      (async () => {
        const contract = await getContract(process.env.NEXT_PUBLIC_BATTLESHIP_CONTRACT_ADDRESS as string, battleshipWakuAbi.abi);
        // const gamesContract = await contract.getAllGames({
        //   gasLimit: 500000
        // });
        // let parsedGames: any[] = [];
        // // If games is an array of arrays (each game is an array of values)
        // if (Array.isArray(gamesContract) && gamesContract.length > 0) {
        //   parsedGames = gamesContract.map((game, index) => {
        //       if (Array.isArray(game)) {
        //           return {
        //               gameId: game[0].toString(),
        //               player1: game[1].toString(),
        //               player2: game[2].toString(),
        //               isActive: game[3].toString(),
        //               playerTurn: game[4].toString(),
        //               player1_board_commitment: game[5].toString(),
        //               player1_merkle_root: game[6].toString(),
        //               player2_board_commitment: game[7].toString(),
        //               player2_merkle_root: game[8].toString(),
        //               wakuRoomId: game[11].toString(),
        //               // Add the rest of the fields based on your GameView struct
        //           };
        //       }
        //       return game;
        //   });
        // }
        // console.log({parsedGames});
        // localStorage.setItem('games', JSON.stringify(parsedGames));
        // setGames(parsedGames);
        const games = localStorage.getItem('games');
        if(!games) {
          console.log("No games found!");
          return;
        }
        const parsedGames = JSON.parse(games);
        setGames(parsedGames);
        console.log({parsedGames});
      })();
      
    }, []);

    return(
      <>
        <Navbar />
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
            {games.length > 0 && (
              <>
                <div className="text-center text-gray-500 my-2">
                  OR
                </div>
                <div className="flex flex-col items-center w-full max-w-6xl">
                  <div className="w-full max-h-96 overflow-y-auto border border-gray-300 rounded-lg bg-gray-50 p-4">
                    {games && games.map((game) => {
                      return (
                        <div key={game.gameId} className="mb-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h2 className="text-lg font-semibold text-gray-800">Game #{shorten(game.gameId.toString())}</h2>
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                                Room: {game.wakuRoomId.toString()}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Player 1</label>
                                <p className="text-sm text-gray-700 font-mono bg-gray-100 px-2 py-1 rounded">
                                  {game.player1.toString()}
                                </p>
                              </div>
                              
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Board Commitment</label>
                                <p className="text-xs text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded truncate">
                                  {game.player1_board_commitment}
                                </p>
                              </div>
                              
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Merkle Root</label>
                                <p className="text-xs text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded truncate">
                                  {game.player1_merkle_root}
                                </p>
                              </div>
                            </div>
                            
                            <div className="pt-2">
                              <button
                                className={`w-full px-4 py-2 rounded-md text-white font-medium transition-colors ${
                                !Boolean(username) 
                                    ? 'bg-gray-400 cursor-not-allowed' 
                                    : 'bg-green-500 hover:bg-green-600 active:bg-green-700'
                                }`}
                                disabled={!Boolean(username)}
                                onClick={() => {
                                  if(game.player1.toLowerCase() === address.toLowerCase()) {
                                    router.push(`/room/${game.wakuRoomId.toString()}?username=${username}&gameId=${game.gameId.toString()}`)
                                  } else {
                                    router.push(`/join/${game.wakuRoomId.toString()}?username=${username}&gameId=${game.gameId.toString()}`)
                                  }
                                }}
                              >
                                Join {game.player1.toLowerCase() == address.toLowerCase() ? 'back to your game' : 'this room'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </>
    )
};

export default Page;