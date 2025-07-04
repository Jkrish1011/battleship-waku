import { create } from "zustand";

const useWallet = create((set, get) => ({
  address: null,
  isConnected: false,
  isInitialized: false,
  
  setAddress: (address: string) => set({ address: address }),
  
  // Check if wallet is already connected without prompting
  checkWalletConnection: async () => {
    const { ethereum } = window as any;
    if (!ethereum) {
      set({ isInitialized: true });
      return;
    }

    try {
      // Check if already connected
      const accounts = await ethereum.request({ method: "eth_accounts" });
      if (accounts.length > 0) {
        set({ 
          address: accounts[0], 
          isConnected: true,
          isInitialized: true 
        });
      } else {
        set({ 
          address: null, 
          isConnected: false,
          isInitialized: true 
        });
      }
    } catch (error) {
      console.error("Error checking wallet connection:", error);
      set({ 
        address: null, 
        isConnected: false,
        isInitialized: true 
      });
    }
  },

  // Connect wallet (prompts user)
  connectWallet: async () => {
    const { ethereum } = window as any;
    if (!ethereum) {
      alert("Please install MetaMask!");
      return;
    }

    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      if (accounts.length > 0) {
        set({ 
          address: accounts[0], 
          isConnected: true 
        });
      }
    } catch (error: any) {
      console.error("Error connecting wallet:", error);
      if (error.code === 4001) {
        // User rejected the connection
        console.log("User rejected wallet connection");
      }
    }
  },

  disconnectWallet: () => {
    set({ 
      address: null, 
      isConnected: false 
    });
  },

  // Initialize wallet listeners
  initializeWalletListeners: () => {
    const { ethereum } = window as any;
    if (!ethereum) return;

    // Listen for account changes
    ethereum.on('accountsChanged', (accounts: string[]) => {
      if (accounts.length > 0) {
        set({ 
          address: accounts[0], 
          isConnected: true 
        });
      } else {
        set({ 
          address: null, 
          isConnected: false 
        });
      }
    });

    // Listen for chain changes
    ethereum.on('chainChanged', (chainId: string) => {
      // Reload the page when chain changes
      window.location.reload();
    });

    // Listen for disconnect
    ethereum.on('disconnect', () => {
      set({ 
        address: null, 
        isConnected: false 
      });
    });
  },

  // Cleanup listeners
  cleanupWalletListeners: () => {
    const { ethereum } = window as any;
    if (!ethereum) return;

    ethereum.removeAllListeners('accountsChanged');
    ethereum.removeAllListeners('chainChanged');
    ethereum.removeAllListeners('disconnect');
  }
}));

// const useGames = create((set, get) => ({
//   games: null,
//   setGames: (games: any[]) => set({ games }),
//   getGames: () => get().games as any[],
// }));

export { useWallet };