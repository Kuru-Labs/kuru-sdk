import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "./../config.json";

const { rpcUrl, contractAddress } = KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

const args = process.argv.slice(2);
const size = parseFloat(args[0]);
const minAmountOut = parseFloat(args[1]);

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    try {
        const marketParams = await KuruSdk.ParamFetcher.getMarketParams(
            provider,
            contractAddress
        );
        const receipt = await KuruSdk.IOC.placeMarket(signer, contractAddress, marketParams, {
            approveTokens: true,
            size,
            isBuy: true,
            minAmountOut,
            isMargin: false,
            fillOrKill: true,
        });
        console.log("Transaction hash:", receipt.transactionHash);
    } catch (error) {
        console.error("Error placing market buy order:", error);
    }
})();
