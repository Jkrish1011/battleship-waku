"use client";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getWakuNode, getPeerId } from "./WakuService";

// Define the context shape
interface WakuContextType {
  wakuNode: any;
  peerId: string | undefined;
  loading: boolean;
  error: string | null;
}

const WakuContext = createContext<WakuContextType | undefined>(undefined);

export const useWaku = () => {
  const context = useContext(WakuContext);
  if (!context) throw new Error("useWaku must be used within a WakuProvider");
  return context;
};

interface WakuProviderProps {
  children: ReactNode;
}

const WakuProvider = ({ children }: WakuProviderProps) => {
  const [wakuNode, setWakuNode] = useState<any>(null);
  const [peerId, setPeerId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function initWaku() {
      setLoading(true);
      setError(null);
      try {
        const node = await getWakuNode();
        if (cancelled) return;
        setWakuNode(node);
        setPeerId(await getPeerId());
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "Failed to initialize Waku node");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    initWaku();
    return () => { cancelled = true; };
  }, []);

  return (
    <WakuContext.Provider value={{ wakuNode, peerId, loading, error }}>
      {children}
    </WakuContext.Provider>
  );
};

export default WakuProvider;