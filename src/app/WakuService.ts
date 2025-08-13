import { LightNode, createLightNode, createEncoder, createDecoder } from "@waku/sdk";
import { generateKeyPairFromSeed } from "@libp2p/crypto/keys";
import { fromString } from "uint8arrays";

async function sha256(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex;
}

function generateRandomNumber(): string {
    return Math.random().toString();
}

// export const DEFAULT_CONTENT_TOPIC = "/js-waku-examples/1/message-ratio/utf8";

let wakuNodeInstance: LightNode | null = null;

export async function getWakuNode(): Promise<LightNode> {
    if (wakuNodeInstance) {
        return wakuNodeInstance;
    }

    let seed = localStorage.getItem("seed");
    if (!seed) {
        seed = (await sha256(generateRandomNumber())).slice(0, 32);
        localStorage.setItem("seed", seed);
    }

    const privateKey = await generateKeyPairFromSeed("Ed25519", fromString(seed));

    const node = await createLightNode({
        defaultBootstrap: true,
        libp2p: {
            privateKey,
        },
    });

    await node.start();

    wakuNodeInstance = node;
    (window as any).waku = node;
    return node;
}

export async function getPeerId(): Promise<string | undefined> {
    return wakuNodeInstance?.libp2p.peerId.toString();
}

export function createWakuEncoder(contentTopic: string) {
    try{
        return createEncoder({
            contentTopic: contentTopic,
        });
    }catch(error) {
        console.error("Failed to create Waku encoder:", error);
        return null;
    }
}

export function createWakuDecoder(contentTopic: string) {
    return createDecoder(contentTopic);
}