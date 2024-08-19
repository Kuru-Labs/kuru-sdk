import { ethers, BigNumber } from "ethers";
import * as KuruSdk from "../../src";
import * as KuruConfig from "../config.json";
import {
    WssOrderEvent,
    WssCanceledOrderEvent,
    WssTradeEvent
} from "../../src/types";

const { rpcUrl, contractAddress } = KuruConfig;

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const marketParams = await KuruSdk.ParamFetcher.getMarketParams(
        provider,
        contractAddress
    );

    let l2Book = await KuruSdk.OrderBook.getL2OrderBook(
        provider,
        contractAddress,
        marketParams
    );
    console.log(JSON.stringify(l2Book));

    // Example order creation event
    const orderCreatedEvent: WssOrderEvent = {
        orderId: 34,
        owner: "0x122A73Fb6ad4398e93A16dD15Bb37843eE26d5a9",
        size: BigNumber.from("10000000000"),
        price: BigNumber.from("10089"),
        isBuy: true,
        blockNumber: BigNumber.from("0x63550d"),
        transactionHash:
            "0xcd9ba3148d6d0e9438951262d5c8c787c73f62fe0417a0a222e6b0df36859ceb",
        triggerTime: 1723792668
    };

    l2Book = KuruSdk.OrderBook.reconcileOrderCreated(
        l2Book,
        marketParams,
        orderCreatedEvent
    );
    console.log(JSON.stringify(l2Book));

    // Example order cancellation event
    const canceledOrderEvent: WssCanceledOrderEvent = {
        orderIds: [34],
        makerAddress: "0x8dC168d5Aa8E07c09cF2289921f90Af2d5EEf40a",
        canceledOrdersData: [
            {
                orderid: 34,
                owner: "0x8dC168d5Aa8E07c09cF2289921f90Af2d5EEf40a",
                size: "10000000000",
                price: "10089",
                isbuy: true,
                remainingsize: "10000000000",
                iscanceled: true,
                blocknumber: "0x63554f",
                transactionhash:
                    "0xa5972bd9ce30d0ef9a8872b1a3a2c34d06cebbab73916063d5db1fda863c6222",
                triggertime: "2024-08-16T07:33:12.000Z"
            }
        ]
    };

    l2Book = KuruSdk.OrderBook.reconcileCanceledOrders(
        l2Book,
        marketParams,
        canceledOrderEvent
    );
    console.log(JSON.stringify(l2Book));

    l2Book = KuruSdk.OrderBook.reconcileOrderCreated(
        l2Book,
        marketParams,
        orderCreatedEvent
    );
    console.log(JSON.stringify(l2Book));

    const tradeEvent: WssTradeEvent = {
        orderId: 36,
        makerAddress: "0x122A73Fb6ad4398e93A16dD15Bb37843eE26d5a9",
        isBuy: false,
        price: "100890000000000000000",
        updatedSize: "0",
        takerAddress: "0xf19356914E94763526BA5eBE8fCe7b1848bc3dDE",
        filledSize: "10000000000",
        blockNumber: "0x63577d",
        transactionHash:
            "0x66bf6b216e89da5d83835cc5e36f67214f99223b5d6dd3eda307372d17d78cb4",
        triggerTime: 1723801068
    };

    l2Book = KuruSdk.OrderBook.reconcileTradeEvent(
        l2Book,
        marketParams,
        tradeEvent
    );
    console.log(JSON.stringify(l2Book));
})();
