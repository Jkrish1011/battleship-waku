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
        <div className='sticky top-0 z-50 w-full bg-white border-b border-gray-200 shadow-sm backdrop-blur-sm bg-white/95'>
            <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
                <div className='flex justify-between items-center h-16'>
                    <div className='flex items-center'>
                        <h1 className='text-xl font-bold text-gray-900'>Battleship Waku</h1>
                    </div>
                    
                    <div className='flex items-center gap-4'>
                        {!isInitialized ? (
                            <div className='px-4 py-2 text-sm text-gray-500'>
                                Loading...
                            </div>
                        ) : isConnected && address ? (
                            <>
                            <div className='flex items-center gap-3'>
                                <div className='flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg'>
                                    <div className='w-2 h-2 bg-green-500 rounded-full'></div>
                                    {loading ? <Spinner /> : <span className='text-sm font-medium text-gray-700'>Waku Peer ID: {shortenValue(peerId)}</span>}
                                    {error && <span className='text-sm font-medium text-red-500'>Error: check console</span>}
                                </div>
                                <div className='flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg'>
                                    <div className='w-2 h-2 bg-green-500 rounded-full'></div>
                                    <span className='text-sm font-medium text-gray-700'>{shortenValue(address)}</span>
                                </div>
                                <button 
                                    onClick={() => disconnectWallet()} 
                                    className='px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors duration-200'
                                    title='Disconnects from app only. To fully disconnect, use MetaMask extension.'
                                >
                                    Disconnect App
                                </button>
                            </div>
                            </>
                        ) : (
                            <button 
                                onClick={() => connectWallet()} 
                                className='px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200'
                            >
                                Connect Wallet
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default NavBar