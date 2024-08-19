import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "./../config.json";
import orderbookAbi from "../../abi/OrderBook.json";

const { rpcUrl, contractAddress, userAddress } = KuruConfig;

const args = process.argv.slice(2);
const amount = parseFloat(args[0]);

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    const marketParams = await KuruSdk.ParamFetcher.getMarketParams(
        provider,
        contractAddress
    );

    const orderbook = new ethers.Contract(
        contractAddress,
        orderbookAbi.abi,
        provider
    );
    const l2Book = await orderbook.getL2Book(userAddress);
    const vaultParams = await orderbook.getVaultParams();

    const estimate = await KuruSdk.CostEstimator.estimateRequiredQuoteForBuy(
        provider,
        contractAddress,
        marketParams,
        amount,
        l2Book,
        vaultParams
    );

    console.log(estimate);
})();
