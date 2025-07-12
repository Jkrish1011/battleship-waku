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
        defaultBootstrap: false,
        networkConfig: {
            clusterId: 42,
            shards: [0]
        },
        discovery: {
            dns: false,
            peerExchange: true,
            localPeerCache: false,
        },
        numPeersToUse: 2,
        libp2p: {
            privateKey,
        },
    });

    await Promise.allSettled([
        node.dial("/dns4/waku-test.bloxy.one/tcp/8095/wss/p2p/16Uiu2HAmSZbDB7CusdRhgkD81VssRjQV5ZH13FbzCGcdnbbh6VwZ"),
        node.dial("/dns4/vps-aaa00d52.vps.ovh.ca/tcp/8000/wss/p2p/16Uiu2HAm9PftGgHZwWE3wzdMde4m3kT2eYJFXLZfGoSED3gysofk")
    ]);

    await node.start();
    await node.waitForPeers();

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
            pubsubTopicShardInfo: {
                clusterId: 42,
                shard: 0,
            }
        });
    }catch(error) {
        console.error("Failed to create Waku encoder:", error);
        return null;
    }
}

export function createWakuDecoder(contentTopic: string) {
    return createDecoder(contentTopic, { clusterId: 42, shard: 0 });
}