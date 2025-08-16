import React, { useEffect } from 'react';
import { useWallet } from '../store/useWallet';
import { useWaku } from '../WakuProvider';
import Spinner from './Spinner';

const NavBar = () => {
    const { 
        address, 
        isConnected, 
        isInitialized,
        connectWallet, 
        disconnectWallet, 
        checkWalletConnection, 
        initializeWalletListeners, 
        cleanupWalletListeners 
    } = useWallet() as any;
    const { peerId, loading, error } = useWaku() as any;

    const shortenValue = (value: string) => {
        return `${value.slice(0, 6)}...${value.slice(-4)}`;
    }

    useEffect(() => {
        // Initialize wallet connection check and listeners
        checkWalletConnection();
        initializeWalletListeners();

        // Cleanup listeners on unmount
        return () => {
            cleanupWalletListeners();
        };
    }, []);

    // useEffect(() => {
    //     console.log({error});
    // }, [error]);
    
    return (
  <div className="fixed top-5 left-0 rightz-50 w-full bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl flex items-center justify-between px-3 sm:px-6 py-2 border-b border-white/30 animate-fade-in-up" style={{animationDelay: '0.05s', animationFillMode: 'both'}}>
    <div className="flex items-center">
      <h1 className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight bg-gradient-to-r from-indigo-700 via-blue-700 to-purple-700 bg-clip-text text-transparent drop-shadow">Battleship Waku</h1>
    </div>
    <div className="flex items-center gap-2 sm:gap-4">
      {!isInitialized ? (
        <div className="px-2 py-1 text-xs sm:text-sm text-gray-500 animate-pulse">
          Loading...
        </div>
      ) : isConnected && address ? (
        <>
          <div className="flex items-center gap-2 px-2 py-1 bg-gray-100/80 rounded-lg shadow-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            {loading ? <Spinner /> : <span className="text-xs sm:text-sm font-medium text-gray-700">Waku: {shortenValue(peerId)}</span>}
            {error && <span className="text-xs sm:text-sm font-medium text-red-500">Error</span>}
          </div>
          <div className="flex items-center gap-2 px-2 py-1 bg-gray-100/80 rounded-lg shadow-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs sm:text-sm font-medium text-gray-700">{shortenValue(address)}</span>
          </div>
          <button 
            onClick={() => disconnectWallet()} 
            className="px-3 py-1 text-xs sm:text-sm font-semibold text-gray-700 bg-white/80 border border-gray-300 rounded-lg hover:bg-gray-100 hover:border-gray-400 transition-all duration-200 shadow-sm active:scale-95 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            title="Disconnects from app only. To fully disconnect, use MetaMask extension."
          >
            Disconnect App
          </button>
        </>
      ) : (
        <button 
          onClick={() => connectWallet()} 
          className="px-5 py-1.5 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-md hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all duration-200 active:scale-95"
        >
          Connect Wallet
        </button>
      )}
    </div>
    <style jsx global>{`
      @keyframes fade-in-up {
        0% { opacity: 0; transform: translateY(30px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .animate-fade-in-up {
        animation: fade-in-up 0.7s cubic-bezier(0.39,0.575,0.565,1) both;
      }
    `}</style>
  </div>
);
}

export default NavBar