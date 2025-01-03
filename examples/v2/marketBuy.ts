import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "./../config.json";

import dotenv from "dotenv";
dotenv.config()

const { rpcUrl, contractAddress } = KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

const args = process.argv.slice(2);
const size = parseFloat(args[0]);
const minAmountOut = parseFloat(args[1]);

(async () => {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    provider.pollingInterval = 10;
    const signer = new ethers.Wallet(privateKey, provider);
    try {
        const nonce = await signer.getNonce();
        
        const marketParams = await KuruSdk.ParamFetcher.getMarketParams(
            provider,
            contractAddress
        );
        const receipt = await KuruSdk.IOC.placeMarket(signer, contractAddress, marketParams, {
            approveTokens: true,
            size,
            isBuy: false,
            minAmountOut,
            isMargin: false,
            fillOrKill: true,
            txOptions: {
                priorityFee: 0.001,
                nonce: nonce,
                gasPrice: ethers.parseUnits('1', 'gwei'),
                gasLimit: ethers.parseUnits('1000000', 1)
            },
        });
        console.log("Transaction hash:", receipt.hash);
    } catch (error) {
        console.error("Error placing market buy order:", error);
    }
})();
