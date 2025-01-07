import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "../config.json";

const {userAddress, rpcUrl, marginAccountAddress, baseTokenAddress} = KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

(async () => {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
	
    try {
        const receipt = await KuruSdk.MarginDeposit.deposit(
            signer,
            marginAccountAddress,
            userAddress,
            baseTokenAddress,
            100000,
            18,
            true
        );
        console.log("Transaction hash:", receipt.hash);
    } catch (error: any) {
        console.error("Error depositing:", error);
    }
})();