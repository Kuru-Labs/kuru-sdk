import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "../config.json";
import orderbookAbi from "../../abi/OrderBook.json";

const { userAddress, rpcUrl, contractAddress } = KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    const orderbook = new ethers.Contract(
        contractAddress,
        orderbookAbi.abi,
        provider
    );

    const activeOrdersForMaker =
        await orderbook.getActiveOrdersForAddress(userAddress);

    const canceledOrders = await KuruSdk.OrderCanceler.cancelAllOrders(
        signer,
        contractAddress,
        userAddress,
        activeOrdersForMaker
    );

    console.log(canceledOrders);
})();
