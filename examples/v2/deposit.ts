import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "../config.json";

const {
    userAddress,
    rpcUrl,
    marginAccountAddress,
    baseTokenAddress,
    quoteTokenAddress
} = KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    await KuruSdk.MarginDeposit.deposit(
        signer,
        marginAccountAddress,
        userAddress,
        baseTokenAddress,
        10000,
        18,
        true
    );

    await KuruSdk.MarginDeposit.deposit(
        signer,
        marginAccountAddress,
        userAddress,
        quoteTokenAddress,
        20,
        18,
        true
    );
})();
