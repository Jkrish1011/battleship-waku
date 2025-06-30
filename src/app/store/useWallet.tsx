import { create } from "zustand";

const useWallet = create((set) => ({
  address: null,
  setAddress: (address: string) => set({ address: address }),
  connectWallet: async () => {
    const { ethereum } = window as any;
    if (ethereum) {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      set({ address: accounts[0] });
    }
  },
  disconnectWallet: () => {
    set({ address: null });
  },
}));

export default useWallet