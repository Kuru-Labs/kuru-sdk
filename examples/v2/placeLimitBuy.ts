import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "./../config.json";

const {rpcUrl, contractAddress} = KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

const args = process.argv.slice(2);
const price = parseFloat(args[0]);
const size = parseFloat(args[1]);

(async () => {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    const marketParams = await KuruSdk.ParamFetcher.getMarketParams(provider, contractAddress);

    try {
        const receipt = await KuruSdk.GTC.placeLimit(
            signer,
            contractAddress,
            marketParams,
            {
                price,
                size,
                isBuy: true,
                postOnly: true
            }
        );
        console.log("Transaction hash:", receipt.hash);
    } catch (error) {
        console.error("Error placing limit buy order:", error);
    }
})();
