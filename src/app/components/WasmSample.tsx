
import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import init, { ProofSystem } from '@/wasm/pkg/';

const WasmDemo = () => {
  
    useEffect(() => {
        // Initialize the WASM module
        const initWasm = async () => {
          try {
            await init();
            // Now you can use your exported functions
            const proofSystem = new ProofSystem();
            console.log({proofSystem});


            const proofData = await proofSystem.create_range_proof(BigInt(10000));
            console.log({proofData});
            // Verify the proof
            const isValid = await proofSystem.verify_range_proof(proofData);

            console.log({isValid});
          } catch (err) {
            console.error('Failed to initialize WASM:', err)
          }
        }
    
        initWasm();
      }, []);
    return (
        <div>
            <h3>
                Calling Bulletproofs Now: 
            </h3>
        </div>
    )
}

const WasmSample = dynamic(() => Promise.resolve(WasmDemo), {
    // To Ensure only client-side execution happens
    ssr: false
})

export default WasmSample