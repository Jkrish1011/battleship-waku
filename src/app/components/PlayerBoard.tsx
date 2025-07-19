
"use client"
import React, { useState, useEffect } from "react";
import { Player, Message } from "../types";

import { BOARD_SIZE, createBoard, Ship, SHIPS, ChatMessage, MoveReplyMessage, BoardProofMessage, BoardProofCalldataMessage, SignatureMessage } from "../utils/gameUtils";
// import { BattleshipGameGenerator } from "./helpers/GameGenerator";
import { GameStateChannel } from "./helpers/GameStateChannel";
import { getContract } from "../utils/gameUtils";
import battleshipWakuAbi from "./../abi/BattleshipWaku.json" assert { type: "json" };
import { useWallet } from "../store/useWallet";
import Image from "next/image";
import { toast } from "react-toastify";
import { createWakuEncoder } from "@/app/WakuService";
import { ethers } from "ethers";


function PlayerBoard(props: { 
  latestMessage?: Message,
  player: Player,
  node: any,
  isLoading: boolean,
  error: any,
  roomId: string,
  joinedOrCreated: string,
  gameId: string,
  opponentProofs?: Message | null,
  opponentCalldataProofs?: Message | null,
  opponentMoveProofs?: any, // changed to array for tabbed UI
  localShips?: Ship[],
  contentTopic: string,
  opponentSignature?: Message | null,
}) {
    const {node, isLoading, player, latestMessage, roomId, joinedOrCreated, gameId, opponentProofs, localShips, opponentCalldataProofs, opponentMoveProofs, contentTopic, opponentSignature} = props;
    
    if(!contentTopic) {
      console.log("No content topic found!");
      return;
    }
    
    const encoder = createWakuEncoder(contentTopic);    

    const CURRENT_BOARD_INPUT_STATE = `board_${roomId}_input_state`;
    const [wasmBuffer, setWasmBuffer] = useState<Uint8Array|null>(null);
    const [moveWasmBuffer, setMoveWasmBuffer] = useState<Uint8Array|null>(null);
    const [isReadyToPlay, setIsReadyToPlay] = useState(false);
    const [zkeyBuffer, setZkeyBuffer] = useState<Uint8Array|null>(null);
    const [moveZkeyBuffer, setMoveZkeyBuffer] = useState<Uint8Array|null>(null);
    const {address, getSigner} = useWallet() as {address: string; getSigner: () => Promise<ethers.Signer | null>};
    const [board, setBoard] = useState(createBoard());
    const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
    const [shipPlacement, setShipPlacement] = useState<number[][]>([]);
    const [ships, setShips] = useState<Ship[]>(SHIPS);
    const [isLoadingProof, setIsLoadingProof] = useState(false);
    const [txDetails, setTxDetails] = useState<any>(null);
    const [txError, setTxError] = useState<string|null>(null);
    const [proofPlayer, setProofPlayer] = useState<any>(null);
    const [moveProofOpponentPlayer, setMoveProofOpponentPlayer] = useState<any>(null);
    const [calldataProofOpponentPlayer, setCalldataProofOpponentPlayer] = useState<any>(opponentCalldataProofs || null);
    const [proofOpponentPlayer, setProofOpponentPlayer] = useState<any[]>([]);
    const [calldataPlayer, setCalldataPlayer] = useState<any>(null);
    const [verificationJson, setVerificationJson] = useState<string|null>(null);
    const [moveVerificationJson, setMoveVerificationJson] = useState<string|null>(null);
    const [shipsLocal, setShipsLocal] = useState<Ship[]>(localShips || []);
    const [games, setGames] = useState<any[]>([]);
    const [selectedOpponentProofTab, setSelectedOpponentProofTab] = useState(0);
    const [gameStateChannel, setGameStateChannel] = useState<GameStateChannel | null>(null);

    useEffect(() => {
      const initializeGameStateChannel = async () => {
        console.log("Initalizing game state channel");
        const signer = await getSigner();
        console.log("Signer", signer);
        if (signer) {
          const channel = new GameStateChannel(gameId, roomId, signer);
          console.log("Channel", channel);
          setGameStateChannel(channel);
        }
      };
      
      initializeGameStateChannel();
    }, [gameId, roomId, getSigner]);

    useEffect(() => {
      if(Object.keys(opponentSignature).length > 0 && gameStateChannel) {
        console.log("opponent signature received!");
        console.log(opponentSignature);
        const _opponentSignature = JSON.parse(opponentSignature?.signature || "");
        (async () => {
          const isValid = await gameStateChannel.verifyCustomMessage(_opponentSignature);
          console.log("isValid", isValid);
          if(isValid) {
            toast.success("Signature verified");
          } else {
            toast.error("Signature verification failed");
          }
        })()
      }
    }, [opponentSignature, gameStateChannel]);

    // Reset tab when new proof(s) arrive
    useEffect(() => {
      if (opponentMoveProofs && Array.isArray(opponentMoveProofs) && opponentMoveProofs.length > 0) {
        opponentMoveProofs.filter((item) => {
          if(item) {
            setSelectedOpponentProofTab(opponentMoveProofs.length - 1);
          }
        })
      }
    }, [opponentMoveProofs]);

    useEffect(() => {
      setProofOpponentPlayer(opponentProofs as any);
    }, [opponentProofs]);

    // Filter and parse moveProofs, then setProofOpponentPlayer
    useEffect(() => {
      if (opponentMoveProofs && Array.isArray(opponentMoveProofs)) {
        const validProofs = opponentMoveProofs.filter(Boolean);
        
        const parsedProofs = validProofs.map((item) => {
          if (item && typeof item.moveProof === 'string') {
            try {
              const moveProof = JSON.parse(item.moveProof);
              return { ...item, moveProof: moveProof };
            } catch {
              return item;
            }
          }
          return item;
        });
        
        setMoveProofOpponentPlayer(parsedProofs);
      }
    }, [opponentMoveProofs]);
    
    const doesShipExistOn = (rowIndex: number, colIndex: number, board: number[][]) => {
      return Boolean(board[rowIndex][colIndex]);
    }

    const handleLatestMessage = async (_message: Message) => {
      // 1. Check if the sender is not the same as the player - because we only need to handle opponent's moves.
      // 2. If message has a move, we need to calculate if the move was a hit.
      
      if(_message.sender == player) {
        return;
      }

      if(!_message.move) {
        return;
      }
      const rowIndex = parseInt(_message.move.split(',')[0]);
      const colIndex = parseInt(_message.move.split(',')[1]);
      let hitOrMissFlag = doesShipExistOn(rowIndex, colIndex, board);
      if(hitOrMissFlag) {
        let newBoard = [...board];
        newBoard[rowIndex][colIndex] = 'X';
        setBoard(newBoard);
      }

      const hitOrMiss = hitOrMissFlag? "hit":"miss";
      const hitOrMissNumeric = hitOrMissFlag? 1:0;

      const proof = await generateMoveProof(hitOrMissNumeric, rowIndex, colIndex );
      console.log("proof", proof);
      // Create a new MoveReplyMessage
      // Send this message to the opponent board
      await sendMoveReplyMessage(hitOrMiss, proof);
    }
    
    useEffect(() => {
      if(latestMessage){
        handleLatestMessage(latestMessage);
      }
    },[latestMessage]);

    useEffect(() => {
      // browser fetches them as static assets
      Promise.all([
        fetch("/shipPlacement/ship_placement.wasm").then(r => r.arrayBuffer()).then(buffer => new Uint8Array(buffer)),
        fetch("/shipPlacement/ship_placement_final.zkey").then(r => r.arrayBuffer()).then(buffer => new Uint8Array(buffer)),
        fetch("/shipPlacement/ship_verification_key.json").then(r => r.json()),
        fetch("/moveVerification/move_verification.wasm").then(r => r.arrayBuffer()).then(buffer => new Uint8Array(buffer)),
        fetch("/moveVerification/move_verification_final.zkey").then(r => r.arrayBuffer()).then(buffer => new Uint8Array(buffer)),
        fetch("/moveVerification/move_verification_key.json").then(r => r.json()),
      ])
      .then(([wasm, zkey, verificationJson, moveWasm, moveZKey, moveVerificationJson]) => {
        setWasmBuffer(wasm);
        setZkeyBuffer(zkey);
        setVerificationJson(verificationJson);
        setMoveWasmBuffer(moveWasm);
        setMoveZkeyBuffer(moveZKey);
        setMoveVerificationJson(moveVerificationJson);
      })
      .catch(err => {
        console.error("failed to load wasm or zkey:", err);
      });
    }, []);

    // Replace the ships if found in the localStorage
    useEffect(() => {
      if(shipsLocal != null) {
        for(let i=0; i < shipsLocal.length; i++) {
          const currShip = shipsLocal[i];
          placeShipOnBoardWithShip(currShip.x, currShip.y, currShip);
        }
      }
    }, [shipsLocal]);

    useEffect(() => {
      if (localShips) {
        setShipsLocal(localShips);
      }
    }, [localShips]);

    useEffect(() => {
      if (Object.keys(opponentCalldataProofs).length > 0) {
        setCalldataProofOpponentPlayer(opponentCalldataProofs);
      }
    }, [opponentCalldataProofs]);

    useEffect(() => {
      const _games = localStorage.getItem('games');
      if(_games !== null && _games !== undefined && _games !== '') {
        let parsedGames: any[] = [];
        let _gamesParsed = JSON.parse(_games);
        if (Array.isArray(_gamesParsed) && _gamesParsed.length > 0) {
          parsedGames = _gamesParsed.map((game, index) => {
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
                  };
              }
              return game;
          });
        }
        setGames(parsedGames);
      }
    }, []);

    useEffect(() => {
      console.log("isLoading", isLoading)
      if (!isLoading && gameStateChannel) {
        sendMessage(player, 'joined');
        (async() => {
          await gameStateChannel.initialize();
          const signature = await gameStateChannel.signCustomMessage('joined');
          console.log(signature);
          sendSignatureMessage(player, JSON.stringify(signature));
        })();
      }
    }, [isLoading, gameStateChannel]);

    // const { push } = useLightPush({node, encoder});

    const verifyProofs = async () => {
      if (!gameStateChannel) {
        toast.error("Game state channel not initialized");
        return false;
      }
      console.log({proofPlayer});
      console.log({calldataPlayer});
      const isValid = await gameStateChannel.verifyProof(verificationJson, proofPlayer);
      console.log("isValid", isValid);
      if(isValid) {
        toast.success("Proof verified");
      } else {
        toast.error("Proof verification failed");
      }
      return isValid;
    }

    const verifyOpponentProofs = async () => {
      if (!gameStateChannel) {
        toast.error("Game state channel not initialized");
        return false;
      }
      console.log("verifying opponent proofs")
      const isValid = await gameStateChannel.verifyProof(verificationJson, proofOpponentPlayer);
      console.log("isValid", isValid);
      if(isValid) {
        toast.success("Proof verified");
      } else {
        toast.error("Proof verification failed");
      }
      return isValid;
    }

    const verifyOpponentMoveProofs = async () => {
      if (!gameStateChannel) {
        toast.error("Game state channel not initialized");
        return false;
      }
      console.log("verifying opponent move proofs");
      const proof = moveProofOpponentPlayer?.[selectedOpponentProofTab];
      if (!proof) return null;
      let proofData;
      try {
        proofData = JSON.parse(proof?.moveProof.proof || {});
      } catch {
        proofData = proof?.moveProof.proof;
      }
      console.log(proofData);
      const isValid = await gameStateChannel.verifyProof(moveVerificationJson, proofData);
      console.log("Move isValid", isValid);
      if(isValid) {
        toast.success("Move Proof verified");
      } else {
        toast.error("Move Proof verification failed");
      }
      return isValid;
    }

    const sendReadyToPlay = async () => {
      if(!areAllShipsPlaced()) {
        alert('Please place all ships before sending ready to play message');
        return;
      }
      if(!calldataPlayer) {
        alert('Please generate board proof before sending ready to play message');
        return;
      }
      
      await joinGame();
        
      console.log('sending calldataplayer message');
      console.log({calldataPlayer});
      await sendBoardCalldataMessage(JSON.stringify(calldataPlayer));
      console.log('sending proofPlayer message');
      await sendBoardProofMessage(JSON.stringify(proofPlayer));
      console.log('Ready Message');
      await sendMessage(player, 'ready');
    }

    const joinGame = async () => {
      if(!areAllShipsPlaced()) {
        alert('Please place all ships before joining game');
        return;
      }
      console.log({games});
      let existingGameFound_Player1 = false;
      let existingGameFound_Player2 = false;
      let tx;
      setTxDetails(null);
      setTxError(null);
      try{
        const battleshipWaku = await getContract(process.env.NEXT_PUBLIC_BATTLESHIP_CONTRACT_ADDRESS as string, battleshipWakuAbi.abi);
        const userAddress = address;
        if(games.length > 0) {
          for(let i=0; i < games.length; i++) {
            const game = games[i];
            if(game.gameId.toString() === gameId?.toString() && game.player1.toLowerCase() === address?.toString().toLowerCase() && joinedOrCreated === "created") {
              existingGameFound_Player1 = true;
              toast.success("You had already joined the game on-chain. Please continue playing.");
              return;
            } else if (game.gameId.toString() === gameId?.toString() && game.player2.toLowerCase() === address?.toString().toLowerCase() && game.isActive === "true" && joinedOrCreated === "joined") {
              existingGameFound_Player2 = true;
              toast.success("You had already joined the game on-chain. Please continue playing.");
              return;
            }
          }
          if(joinedOrCreated === "created" && existingGameFound_Player1 === false) {
            let _gameId = gameId;
            if(!_gameId) {
              _gameId = gameStateChannel.randomBytesCrypto(32);
            } else {
              _gameId = gameId;
            }
            tx = await battleshipWaku.createGame(userAddress, calldataPlayer, _gameId, roomId, {
              gasLimit: 5000000
            });
            // State Channel Game creation.
            await gameStateChannel.createGame(userAddress, gameStateChannel.bigIntToBytes32(calldataPlayer[3][0]), gameStateChannel.bigIntToBytes32(calldataPlayer[3][1]), calldataPlayer);
            localStorage.setItem(`ships_${roomId}_GameState`, JSON.stringify(gameStateChannel.getGameState()));
          } else if(joinedOrCreated === "joined" && existingGameFound_Player2 === false){
            console.log("joining game");
            tx = await battleshipWaku.JoinGame(userAddress, calldataPlayer, gameId, {
              gasLimit: 5000000
            });
            // State Channel Game joining.
            await gameStateChannel.joinGame(userAddress, gameStateChannel.bigIntToBytes32(calldataPlayer[3][0]), gameStateChannel.bigIntToBytes32(calldataPlayer[3][1]), calldataPlayer);
            localStorage.setItem(`ships_${roomId}_GameState`, JSON.stringify(gameStateChannel.getGameState()));
          } 
        }
        
        toast.promise(tx.wait(), {
          pending: "Transaction sent. Please wait for it to be confirmed.",
          success: "Transaction confirmed.",
          error: "Transaction failed."
        });
        setTxDetails({ hash: tx.hash, status: 'completed' });
      }catch(error: any){
        setTxError(error?.message || 'Proof generation or transaction error');
        setTxDetails(null);
        console.error('Error joining game:', error);
      }
    }

    const generateBoardProof = async () => {
      if(!areAllShipsPlaced()) {
        alert('Please place all ships before generating board proof');
        return;
      }

      setIsLoadingProof(true);
      try {
        const correctInput = await gameStateChannel.generateCorrectInput(shipPlacement);
        localStorage.setItem(CURRENT_BOARD_INPUT_STATE, JSON.stringify(correctInput));
        const {proof: _proofPlayer, calldata: _calldataPlayer} = await gameStateChannel.generateProof(correctInput, wasmBuffer as Uint8Array, zkeyBuffer as Uint8Array);
        setProofPlayer(_proofPlayer);
        setCalldataPlayer(_calldataPlayer);
        // console.log({ships});

        // localStorage.setItem(`ships_${roomId}`, JSON.stringify(ships.map(item => ({...item, placed: false}))));
        localStorage.setItem(`ships_${roomId}`, JSON.stringify(ships));
      } catch (error: any) {
        setTxError(error?.message || 'Proof generation or transaction error');
        console.error('Proof generation error:', error);
      } finally {
        setIsLoadingProof(false);
        setIsReadyToPlay(true);
      }
    }

    const generateMoveProof = async (hit: number, x: number, y: number) => {
      if(!areAllShipsPlaced()) {
        alert('Please place all ships before generating board proof');
        return;
      }
      setIsLoadingProof(true);

      try {
        const boardState = JSON.parse(localStorage.getItem(CURRENT_BOARD_INPUT_STATE) as string);
        const moveInput = {
          salt: boardState.salt,
          commitment: boardState.commitment,
          merkle_root: boardState.merkle_root,
          board_state: boardState.board_state,
          guess_x: x,
          guess_y: y,
          hit: hit
        };
        const {proof: _proofPlayer, calldata: _calldataPlayer} = await gameStateChannel.generateProof(moveInput, moveWasmBuffer as Uint8Array, moveZkeyBuffer as Uint8Array);
        
        return {proof: _proofPlayer, calldata: _calldataPlayer};

      } catch (error: any) {
        setTxError(error?.message || 'Move Proof generation or transaction error');
        console.error('Move Proof generation error:', error);
      } finally {
        setIsLoadingProof(false);
        setIsReadyToPlay(true);
      }
    }

    const respondToMove = async (move:string) => {
      const rowIndex = parseInt(move.split(',')[0]);
      const colIndex = parseInt(move.split(',')[1]);

      if (doesShipExistOn(rowIndex, colIndex, board)) {
          console.log(" opponent hit a ship")
          let newBoard = [...board];
          newBoard[rowIndex][colIndex] = 'X';
          setBoard(newBoard);
          return;
      }

      console.log("opponent missed");
    }

    const handleReset = () => {
      setShips(SHIPS);
      setSelectedShip(null);
      setBoard(createBoard());
      setShipPlacement([]);
      setShipsLocal([]);
      setIsReadyToPlay(false);
    };

    const handleShipSelection = (ship: Ship) => {
      if (!ship.placed) {
        setSelectedShip(ship);
      }
    };

    const areAllShipsPlaced = () => {
        // get a count of all placed ships
        const placedShips = ships.filter((_ship: Ship) => _ship.placed);
        return placedShips.length === SHIPS.length;
    }

    const resetShipPlacement = (shipId: number) => {
      const newBoard = createBoard();
      // Reset the board without the reset ship
      ships.forEach((ship) => {
        if (ship.id !== shipId && ship.placed) {
          // Re-place each ship except the reset one
          // Similar logic as placeShipOnBoard but without user interaction
        }
      });
      setBoard(newBoard);
      // Mark the reset ship as not placed
      setShips(
        ships.map((ship) =>
          ship.id === shipId ? { ...ship, placed: false } : ship
        )
      );
    };

    // New function to place ship with ship parameter
    const placeShipOnBoardWithShip = (rowIndex: number, colIndex: number, currShip: Ship) => {
      setSelectedShip(currShip);
      const newBoard = [...board];
      let canPlace = true;

      // Check if the ship can be placed
      for (let i = 0; i < currShip.size; i++) {
        if (currShip.orientation === "horizontal") {
          if (
            colIndex + i >= BOARD_SIZE ||
            newBoard[rowIndex][colIndex + i] !== 0
          ) {
            canPlace = false;
            break;
          }
        } else {
          if (
            rowIndex + i >= BOARD_SIZE ||
            newBoard[rowIndex + i][colIndex] !== 0
          ) {
            canPlace = false;
            break;
          }
        }
      }

      if (canPlace) {
        for (let i = 0; i < currShip.size; i++) {
          if (currShip.orientation === "horizontal") {
            newBoard[rowIndex][colIndex + i] = 1; // Mark ship cells with 1
          } else {
            newBoard[rowIndex + i][colIndex] = 1;
          }
        }
        setBoard(newBoard);

        // Mark the ship as placed
        const newShips = shipsLocal.map((ship) =>
          ship.id === currShip.id ? { ...ship, placed: true, x: rowIndex, y: colIndex } : ship
        );
        setShipPlacement(prev => [...prev, [rowIndex, colIndex, currShip.size, currShip.orientation === "horizontal" ? 1 : 0]]);
        setShips(newShips);
        setSelectedShip(null); // Clear selection
      }
    };

    const placeShipOnBoard = (rowIndex: number, colIndex: number) => {
      if (!selectedShip) return;

      const newBoard = [...board];
      let canPlace = true;

      // Check if the ship can be placed
      for (let i = 0; i < selectedShip.size; i++) {
        if (selectedShip.orientation === "horizontal") {
          if (
            colIndex + i >= BOARD_SIZE ||
            newBoard[rowIndex][colIndex + i] !== 0
          ) {
            canPlace = false;
            break;
          }
        } else {
          if (
            rowIndex + i >= BOARD_SIZE ||
            newBoard[rowIndex + i][colIndex] !== 0
          ) {
            canPlace = false;
            break;
          }
        }
      }

      if (canPlace) {
        for (let i = 0; i < selectedShip.size; i++) {
          if (selectedShip.orientation === "horizontal") {
            newBoard[rowIndex][colIndex + i] = 1; // Mark ship cells with 1
          } else {
            newBoard[rowIndex + i][colIndex] = 1;
          }
        }
        setBoard(newBoard);

        // Mark the ship as placed
        const newShips = ships.map((ship) =>
          ship.id === selectedShip.id ? { ...ship, placed: true, x: rowIndex, y: colIndex } : ship
        );
        setShipPlacement(prev => [...prev, [rowIndex, colIndex, selectedShip.size, selectedShip.orientation === "horizontal" ? 1 : 0]]);
        setShips(newShips);
        setSelectedShip(null); // Clear selection
      }
    };

    // This is the function which will sent the message betweent the players in real time.
    const sendMessage = async (sender: string, message: string) => {
      /*
        1/ Create a message
        2/ Serialize the message
        3/ Use push functionality to send the message
      */
        console.log("Sending message...");
        // 1/ create message
        const newMessage = ChatMessage.create({
          timestamp: Date.now(),
          message,
          sender,
          id: crypto.randomUUID()
        });

        // 2/ Serialize message
        const serializedMessage = ChatMessage.encode(newMessage).finish();

        // 3/ Push Message
        // if (push) {
        //   const pushRes = await push({
        //     timestamp: new Date(),
        //     payload: serializedMessage
        //   }); 
        // }

        const result = await node.lightPush.send(encoder, {
          payload: serializedMessage,
          timestamp: new Date(),
        }, { autoRetry: true });

        if (result.successes.length > 0) {
          console.log(`message sent successfully.`);
        } else {
          console.warn(`Failed to send message:`, result.failures);
        }
    }

    const sendSignatureMessage = async (sender: string, signature: string) => {
      /*
        1/ Create a message
        2/ Serialize the message
        3/ Use push functionality to send the message
      */
        console.log("Sending message...");
        // 1/ create message
        const newMessage = SignatureMessage.create({
          timestamp: Date.now(),
          signature,
          sender,
          id: crypto.randomUUID()
        });

        // 2/ Serialize message
        const serializedMessage = SignatureMessage.encode(newMessage).finish();

        // 3/ Push Message
        // if (push) {
        //   const pushRes = await push({
        //     timestamp: new Date(),
        //     payload: serializedMessage
        //   }); 
        // }

        const result = await node.lightPush.send(encoder, {
          payload: serializedMessage,
          timestamp: new Date(),
        }, { autoRetry: true });

        if (result.successes.length > 0) {
          console.log(`message sent successfully.`);
        } else {
          console.warn(`Failed to send message:`, result.failures);
        }
    }

    // This is the function which will sent the proofs between the players in real time.
    const sendBoardProofMessage = async (proof: string) => {
    
      console.log("sending proof message");
      // 1/ create message
      const newMessage = BoardProofMessage.create({
        timestamp: Date.now(),
        sender: player,
        proof: proof,
        id: crypto.randomUUID()
      });

      // 2/ Serialize message
      const serializedMessage = BoardProofMessage.encode(newMessage).finish();

      // 3/ Push Message
      // if (push) {
      //   const pushRes = await push({
      //     timestamp: new Date(),
      //     payload: serializedMessage
      //   });
        
      //   if (pushRes?.errors?.length && pushRes?.errors?.length) {
      //     alert('unable to connect to a stable node. please reload the page!');
      //   }
      // }

      const result = await node.lightPush.send(encoder, {
        payload: serializedMessage,
        timestamp: new Date(),
      }, { autoRetry: true });

      if (result.successes.length > 0) {
        console.log(`message sent successfully.`);
      } else {
        console.warn(`Failed to send message:`, result.failures);
      }
    }

    const sendBoardCalldataMessage = async (proof: string) => {
    
      console.log("sending calldata message");
      // 1/ create message
      const newMessage = BoardProofCalldataMessage.create({
        timestamp: Date.now(),
        sender: player,
        calldata: proof,
        id: crypto.randomUUID()
      });

      // 2/ Serialize message
      const serializedMessage = BoardProofCalldataMessage.encode(newMessage).finish();

      // 3/ Push Message
      // if (push) {
      //   const pushRes = await push({
      //     timestamp: new Date(),
      //     payload: serializedMessage
      //   });
        
      //   if (pushRes?.errors?.length && pushRes?.errors?.length) {
      //     alert('unable to connect to a stable node. please reload the page!');
      //   }
      // }

      const result = await node.lightPush.send(encoder, {
        payload: serializedMessage,
        timestamp: new Date(),
      }, { autoRetry: true });

      if (result.successes.length > 0) {
        console.log(`message sent successfully.`);
      } else {
        console.warn(`Failed to send message:`, result.failures);
      }
    }

    const sendMoveReplyMessage = async (hit: string, proof: any) => {
      /*
        1/ Create a message
        2/ Serialize the message
        3/ Use push functionality to send the message
      */

      // 1/ create message
      const newMessage = MoveReplyMessage.create({
        timestamp: Date.now(),
        hit: hit,
        sender: player,
        moveProof: JSON.stringify(proof),
        id: crypto.randomUUID()
      });

      // 2/ Serialize message
      const serializedMessage = MoveReplyMessage.encode(newMessage).finish();

      // 3/ Push Message
      // if (push) {
      //   const pushRes = await push({
      //     timestamp: new Date(),
      //     payload: serializedMessage
      //   });
      //   // console.log({pushRes});

      //   if (!pushRes) {
      //     alert('unable to connect to a stable node. please reload the page!');
      //   }
      // }
      const result = await node.lightPush.send(encoder, {
        payload: serializedMessage,
        timestamp: new Date(),
      }, { autoRetry: true });

      if (result.successes.length > 0) {
        console.log(`message sent successfully.`);
      } else {
        console.warn(`Failed to send message:`, result.failures);
      }
    }

    const requestGameState = () => {
      try{
        
      }catch(error) {
        console.error(error);
      }finally{

      }
    }

    return (
      <>
      <div className="relative">
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
              <span className="text-gray-800 font-semibold text-lg mb-1">Generating Proof</span>
              <span className="text-gray-500 text-sm text-center">Please wait while we generate your proof and send the transaction…</span>
            </div>
          </div>
        )}
        <div className={`grid grid-cols-2 gap-4 ${isLoadingProof ? 'pointer-events-none opacity-50' : ''}`}> 
          <div className="flex flex-col items-center space-y-2 mt-4">
            {shipsLocal.length === 0 && ships
              .filter((ship) => !ship.placed)
              .map((ship) => (
                <button 
                  key={ship.id} 
                  onClick={() => handleShipSelection(ship)}
                  className="px-4 py-2 bg-blue-500 text-white font-bold rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                  >
                  Ship {ship.id} (Size: {ship.size}, {ship.orientation})
                </button>
              ))}
          </div>
          <div className="flex flex-col items-center space-y-2 mt-4">
            <div className="board">
              {board.map((row, rowIndex) => (
                <div key={rowIndex} className="row">
                  {row.map((cell, colIndex) => (
                    <div
                      key={colIndex}
                      className={`cell ${cell === 1 ? "ship" : ""}`}
                      onClick={() => {
                        if (cell === 1) resetShipPlacement(rowIndex);
                        else placeShipOnBoard(rowIndex, colIndex);
                      }}
                    >
                      {cell === 'X' && 'X'}
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex flex-col justify-center items-center w-full py-4 gap-4">
                <button 
                  onClick={handleReset}
                  className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
                  >
                  Reset Board
                </button>
                <button
                  onClick={generateBoardProof}
                  className={`px-6 py-2 font-bold rounded transition-colors duration-150 ${
                    areAllShipsPlaced() ? 'bg-green-500 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50' : 'bg-gray-500 text-gray-200 cursor-not-allowed'}`}
                  
                >
                  Generate Board Proof
                </button>
                <button
                  onClick={sendReadyToPlay}
                  className={`px-6 py-2 font-bold rounded transition-colors duration-150 ${
                    isReadyToPlay ? 'bg-green-500 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50' : 'bg-gray-500 text-gray-200 cursor-not-allowed'}`}
                  
                >
                  Ready to play
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* Proof container */}
        {calldataPlayer && (
        <div id="proof-container" className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="space-y-4">
            <h3 className="font-bold mb-2">Your Board Proof</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proof</label>
              <textarea
                id="proof"
                className="w-full h-40 p-3 bg-gray-100 rounded font-mono text-sm resize-y"
                readOnly
                value={(() => {
                  const _p = {
                    pA: calldataPlayer[0].toString(),
                    pB: calldataPlayer[1].toString(),
                    pC: calldataPlayer[2].toString(),
                    publicInput: calldataPlayer[3].toString(),
                  };
                  return JSON.stringify(_p, null, 2);
                })()}
              />
            </div>
            <button id="verifyProofs" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors" onClick={verifyProofs}>
              Verify Proof In-Browser
            </button>
          </div>
        </div>
        )}
        {Object.keys(calldataProofOpponentPlayer).length > 0 && (
        <div id="proof-container" className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="space-y-4">
            <h3 className="font-bold mb-2">Opponent Board Proof</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proof</label>
              <textarea
                id="proof"
                className="w-full h-40 p-3 bg-gray-100 rounded font-mono text-sm resize-y"
                readOnly
                value={(() => {
                  const _p = {
                    pA: calldataProofOpponentPlayer[0].toString(),
                    pB: calldataProofOpponentPlayer[1].toString(),
                    pC: calldataProofOpponentPlayer[2].toString(),
                    publicInput: calldataProofOpponentPlayer[3].toString(),
                  };
                  return JSON.stringify(_p, null, 2);
                })()}
              />
            </div>
            <button id="verifyProofs" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors" onClick={verifyOpponentProofs}>
              Verify Proof In-Browser
            </button>
          </div>
        </div>
        )}
        {/* "@waku/react": "^0.0.7-559159a",
        "@waku/sdk": "^0.0.29", */}
        {moveProofOpponentPlayer && moveProofOpponentPlayer?.length > 0 && (
          <div id="proof-container" className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="space-y-4">
              <h3 className="font-bold mb-2">Opponent Move Proofs</h3>
              <div className="mb-4 flex space-x-2">
                {moveProofOpponentPlayer?.map((_: any, idx: number) => (
                  <button
                    key={idx}
                    className={`px-4 py-2 rounded-t font-semibold border-b-2 transition-colors duration-150 ${selectedOpponentProofTab === idx ? 'border-blue-600 bg-white' : 'border-transparent bg-gray-200 hover:bg-gray-300'}`}
                    onClick={() => setSelectedOpponentProofTab(idx)}
                  >
                    Proof {idx + 1}
                  </button>
                ))}
              </div>
              {(() => {
                const proof = moveProofOpponentPlayer?.[selectedOpponentProofTab];
                if (!proof) return null;
                let calldata;
                try {
                  calldata = JSON.parse(proof?.moveProof.calldata || "{}");
                } catch {
                  calldata = proof?.moveProof.calldata;
                }
                const _p = {
                  pA: calldata[0],
                  pB: calldata[1],
                  pC: calldata[2],
                  publicInput: calldata[3],
                };
                
                return (
                  <>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Move Proofs</label>
                    <textarea id="proof" className="w-full h-40 p-3 bg-gray-100 rounded font-mono text-sm resize-y" 
                    readOnly
                    value={JSON.stringify(_p, null, 2)}
                    />
                    <button id="verifyProofs" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors mt-4" onClick={verifyOpponentMoveProofs}>
                      Verify Move Proofs In-Browser
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        )}
        {/* Transaction details section */}
        <div className="mt-6 p-4 bg-gray-100 rounded shadow">
          <h3 className="font-bold mb-2">Transaction Details</h3>
          {txError && <div className="text-red-600">Error: {txError}</div>}
          {txDetails ? (
            <div>
              <div><span className="font-semibold">Tx Hash:</span> <span className="break-all">{txDetails.hash}</span></div>
              <div><span className="font-semibold">Status:</span> {txDetails.status}</div>
            </div>
          ) : (
            <div className="text-gray-500">No transaction yet.</div>
          )}
        </div>

         {/* State Channel Details */}
         <div className="mt-6 p-4 bg-gray-100 rounded shadow">
          <h3 className="font-bold mb-2">State Channel Details</h3>
          <label className="block text-sm font-medium text-gray-700 mb-1">State Channel</label>
            <textarea id="proof" className="w-full h-40 p-3 bg-gray-100 rounded font-mono text-sm resize-y" 
            readOnly
            value={JSON.stringify(gameStateChannel, null, 2)}
            />
        </div>
      </div>
      </>
    );
}

export default PlayerBoard;