import { ethers } from "ethers";
import * as KuruSdk from "../../src";
import * as KuruConfig from "../config.json";
import { WssTradeEvent } from "../../src/types";

const { rpcUrl, contractAddress } = KuruConfig;

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const marketParams = await KuruSdk.ParamFetcher.getMarketParams(provider, contractAddress);

    // Get initial orderbook
    let l2Book = await KuruSdk.OrderBook.getL2OrderBook(provider, contractAddress, marketParams);
    
    // Print initial best bid
    if (l2Book.bids.length > 0) {
        console.log("Initial Best Bid Price:", l2Book.bids[0][0]);
        console.log("Initial Best Bid Size:", l2Book.bids[0][1]);
    } else {
        console.log("No initial bids");
    }

    // Example trade event
    const tradeEvent: WssTradeEvent = {
        orderId: 0,
        makerAddress: "0x7d43103f26323c075B4D983F7F516b21592e2512",
        isBuy: false,
        price: "245129940455074295310",
        updatedSize: "395235",
        takerAddress: "0xecc442E88Cd6B71FCcb256A5Fc838AdeE941a97e",
        filledSize: "100000",
        blockNumber: "2685299",
        transactionHash: "0xd22a6fd138d0723a9c8a9b631d2fdbc3b2903cad6b3ce7800e76403784cc7949",
        triggerTime: 100
    };

    // Reconcile the trade
    l2Book = KuruSdk.OrderBook.reconcileTradeEvent(l2Book, marketParams, tradeEvent);

    // Print final best bid
    if (l2Book.bids.length > 0) {
        console.log("\nFinal Best Bid Price:", l2Book.bids[0][0]);
        console.log("Final Best Bid Size:", l2Book.bids[0][1]);
    } else {
        console.log("\nNo final bids");
    }
})(); 