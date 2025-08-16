// @ts-nocheck

"use client"
import { useRouter } from "next/navigation";
import Image from "next/image";
import NavBar from "./components/NavBar";
import { useWallet } from "./store/useWallet";
import { useWaku } from "@/app/WakuProvider";
import {useEffect} from "react";

export default function Home() {

  const router = useRouter();
  const { peerId, loading, error } = useWaku() as any;
  const { address } = useWallet() as any;
  const handleClick = () => {
    router.push('/room');
  };

  return (
    <>
     <NavBar />
<div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#e0e7ff] via-[#c7d2fe] to-[#f3e8ff] px-2 py-4">
  <div className="w-[80vw] max-w-3xl bg-white/60 backdrop-blur-xl rounded-3xl shadow-2xl flex flex-col items-center px-3 py-6 sm:p-8 border border-white/30 animate-fade-in-up" style={{animationDelay: '0.1s', animationFillMode: 'both'}}>
    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-900 mb-4 text-center tracking-tight drop-shadow-lg bg-gradient-to-r from-indigo-700 via-blue-700 to-purple-700 bg-clip-text text-transparent animate-fade-in-up" style={{animationDelay: '0.2s', animationFillMode: 'both'}}>
      Battleship Game
    </h1>
    <div className="w-full flex justify-center mb-6 animate-fade-in-up" style={{animationDelay: '0.3s', animationFillMode: 'both'}}>
      <div className="w-[80vw] max-w-[480px] flex justify-center">
        <Image 
          src="/background_3.png" 
          alt="logo" 
          className="rounded-2xl object-cover w-full h-[40vw] max-h-[56vw] sm:h-[320px] sm:max-h-[400px] shadow-xl border-4 border-white/40 transition-transform duration-500 hover:scale-105 hover:rotate-1 active:scale-95 cursor-pointer animate-bounce-slow" 
          width={800} 
          height={480} 
          priority
        />
      </div>
    </div>
    {address ? (
      <button
        onClick={handleClick}
        className={`w-full mt-2 bg-gradient-to-b from-gray-600 to-gray-800 hover:from-gray-700 hover:to-gray-900 text-white font-extrabold py-3 px-8 rounded-xl shadow-lg transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-gray-400 focus:ring-offset-2 active:scale-90 disabled:opacity-60 tracking-wide text-lg sm:text-xl animate-fade-in-up group ${loading ? 'cursor-not-allowed animate-pulse' : ''}`}
        disabled={loading}
        style={{animationDelay: '0.4s', animationFillMode: 'both'}}
      >
        <span className="inline-block group-hover:scale-105 group-active:scale-95 transition-transform duration-200">
          {loading ? 'Loading...' : 'Start Game'}
        </span>
      </button>
    ) : (
      <div className="w-full mt-2 text-gray-700 text-center text-base sm:text-lg font-bold bg-white/60 rounded-xl py-3 px-2 shadow-inner border border-white/30 animate-fade-in-up" style={{animationDelay: '0.4s', animationFillMode: 'both'}}>
        Connect your wallet to begin
      </div>
    )}
  </div>
</div>

<style jsx global>{`
@keyframes fade-in-up {
  0% { opacity: 0; transform: translateY(30px); }
  100% { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fade-in-up 0.7s cubic-bezier(0.39,0.575,0.565,1) both;
}
@keyframes bounce-slow {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
.animate-bounce-slow {
  animation: bounce-slow 2.5s infinite;
}
`}</style>
    </>
  );
}
