"use client"
import { useRouter } from "next/navigation";
import Image from "next/image";
import NavBar from "./components/NavBar";
import { useWallet } from "./store/useWallet";

export default function Home() {

  const router = useRouter();
  const { address } = useWallet() as any;
  const handleClick = () => {
    router.push('/room');
  };

  return (
    <>
     <NavBar />
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-3xl font-bold">
          Battleship Game
        </h1>
        <Image src="/background_3.png" alt="logo" className="w-[50%] h-full object-cover" width={1000} height={1000} />
        {address ? (
          <button 
            onClick={handleClick}
            className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Click here to begin
          </button>
        ) : (
          <div 
            className="mt-4 text-gray-500 text-center text-lg font-bold"
          >
            Connect your wallet to begin
          </div>
        )}
      </div>
</>
  );
}
