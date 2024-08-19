import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "./../config.json";

const { rpcUrl, routerAddress, baseTokenAddress, quoteTokenAddress } =
    KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

const args = process.argv.slice(2);
const size = parseFloat(args[0]);

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    const routeOutput = await KuruSdk.PathFinder.findBestPath(
        provider,
        baseTokenAddress,
        quoteTokenAddress,
        size
    );

    await KuruSdk.TokenSwap.swap(
        signer,
        routerAddress,
        routeOutput,
        size,
        18,
        18,
        10,
        true,
        (txHash: string | null) => {
            console.log(`Transaction hash: ${txHash}`);
        }
    );
})();
