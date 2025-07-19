import { create } from "zustand";
import { ethers } from "ethers";

const useWallet = create((set, get) => ({
  address: null,
  isConnected: false,
  isInitialized: false,
  signer: null,
  
  setAddress: (address: string) => set({ address: address }),
  
  // Check if wallet is already connected without prompting
  checkWalletConnection: async () => {
    const { ethereum } = window as any;
    if (!ethereum) {
      set({ isInitialized: true });
      return;
    }

    try {
      // Check if user manually disconnected
      const manuallyDisconnected = localStorage.getItem('wallet_manually_disconnected');
      if (manuallyDisconnected === 'true') {
        set({ 
          address: null, 
          isConnected: false,
          isInitialized: true,
          signer: null
        });
        return;
      }

      // Check if already connected
      const accounts = await ethereum.request({ method: "eth_accounts" });
      if (accounts.length > 0) {
        // Recreate signer if wallet is connected
        const provider = new ethers.BrowserProvider(ethereum);
        const signer = await provider.getSigner();
        set({ 
          address: accounts[0], 
          isConnected: true,
          isInitialized: true,
          signer: signer
        });
      } else {
        set({ 
          address: null, 
          isConnected: false,
          isInitialized: true,
          signer: null
        });
      }
    } catch (error) {
      console.error("Error checking wallet connection:", error);
      set({ 
        address: null, 
        isConnected: false,
        isInitialized: true,
        signer: null
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
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      if (accounts.length > 0) {
        const signer = await provider.getSigner();
        set({ 
          address: accounts[0], 
          isConnected: true,
          signer: signer 
        });
        
        // Clear manual disconnection flag when user connects
        localStorage.removeItem('wallet_manually_disconnected');
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
    // Note: This only disconnects the app state, not MetaMask itself
    // MetaMask doesn't support programmatic disconnection
    set({ 
      address: null, 
      isConnected: false,
      signer: null
    });
    
    // Store disconnection preference to prevent auto-reconnect
    localStorage.setItem('wallet_manually_disconnected', 'true');
    
    // Show user instructions for full disconnection
    alert('App disconnected! To fully disconnect MetaMask:\n\n1. Click MetaMask extension\n2. Go to Settings → Connected Sites\n3. Find this app and disconnect');
  },

  // Create wallet and store signer
  createWallet: async () => {
    const { ethereum } = window as any;
    if (!ethereum) {
      alert("Please install MetaMask!");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      if (accounts.length > 0) {
        const signer = await provider.getSigner();
        set({
          address: accounts[0],
          isConnected: true,
          signer: signer
        });
        
        // Clear manual disconnection flag when user connects
        localStorage.removeItem('wallet_manually_disconnected');
      }
    } catch (error: any) {
      console.error("Error creating wallet:", error);
      if (error.code === 4001) {
        // User rejected the connection
        console.log("User rejected wallet connection");
      }
    }
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

  // Get or create signer - ensures signer is available when needed
  getSigner: async () => {
    const state = get() as any;
    
    // If signer already exists, return it
    if (state.signer) {
      return state.signer;
    }
    
    // If not connected, return null
    if (!state.isConnected || !state.address) {
      return null;
    }
    
    // Recreate signer
    const { ethereum } = window as any;
    if (!ethereum) {
      return null;
    }
    
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      set({ signer });
      return signer;
    } catch (error) {
      console.error("Error creating signer:", error);
      return null;
    }
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

export { useWallet };