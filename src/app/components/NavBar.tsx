import React from 'react';
import useWallet from '../store/useWallet';

const NavBar = () => {
  const { address, connectWallet, disconnectWallet } = useWallet() as any;
  const shortenAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  return (
    <div className='flex justify-between items-end p-1 h-1 bg-white'>
        <div className='flex items-center gap-2'>
            
            {address ? (
                <>
                <p>{shortenAddress(address)}</p>
                <button onClick={() => disconnectWallet()} className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded'>
                    Disconnect Wallet
                </button>
                </>
            ) : (
                <button onClick={() => connectWallet()} className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded'>
                    Connect Wallet
                </button>
            )}
        </div>
    </div>
    );
}

export default NavBar