import { ethers, BigNumber } from "ethers";

import { TradeEvent, OrderEvent } from "../types/types";
import orderbookAbi from "../../abi/OrderBook.json";

export class MarketListener {
    private contract: ethers.Contract;

    constructor(rpcUrl: string, contractAddress: string) {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        this.contract = new ethers.Contract(
            contractAddress,
            orderbookAbi.abi,
            provider
        );
    }

    async listenForOrders(callback: (order: OrderEvent) => void) {
        this.contract.on(
            "OrderCreated",
            async (
                orderId: BigNumber,
                ownerAddress: string,
                size: BigNumber,
                price: BigNumber,
                isBuy: boolean
            ) => {
                callback({ orderId, ownerAddress, size, price, isBuy });
            }
        );
    }

    async listenForTrades(callback: (trade: TradeEvent) => void) {
        this.contract.on(
            "Trade",
            async (
                orderId: BigNumber,
                isBuy: boolean,
                price: BigNumber,
                updatedSize: BigNumber,
                takerAddress: string,
                filledSize: BigNumber
            ) => {
                callback({
                    orderId,
                    isBuy,
                    price,
                    updatedSize,
                    takerAddress,
                    filledSize
                });
            }
        );
    }
}
