import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "../config.json";

const { rpcUrl, contractAddress } = KuruConfig;


export interface OrderBookData {
    asks: number[][];
    bids: Record<string, string>;
    blockNumber: number;
}

class OrderbookWatcher {
    private lastOrderbookJson: string | null = null;

    constructor() {}

    public startWatching(intervalMs: number = 500): void {
        setInterval(async () => {
            try {
                const provider = new ethers.JsonRpcProvider(rpcUrl);
                const marketParams = await KuruSdk.ParamFetcher.getMarketParams(provider, contractAddress);

                const currentOrderbook = await KuruSdk.OrderBook.getFormattedL2OrderBook(
                    provider,
                    contractAddress,
                    marketParams
                );
                const currentOrderbookJson = JSON.stringify(currentOrderbook, null, 4); // 4-space indentation for pretty printing
                if (this.lastOrderbookJson !== currentOrderbookJson) {
                    const asksArray = currentOrderbook.asks
                        .map(([price, quantity]) => ({ price, quantity }))
                        .sort((a, b) => a.price - b.price)  // Sort asks ascending
                        .slice(0, 30)
                        .sort((a, b) => b.price - a.price);  // Take first 30 asks
                    
                    const bidsArray = currentOrderbook.bids
                        .map(([price, quantity]) => ({ price, quantity }))
                        .sort((a, b) => b.price - a.price)  // Sort bids descending
                        .slice(0, 30);  // Take first 30 bids

                    const maxBaseSize = Math.max(
                        ...asksArray.map(a => a.quantity),
                        ...bidsArray.map(b => b.quantity)
                    );
                    const maxBaseSizeLength = maxBaseSize.toString().length;
                    const printLine = (price: number, size: number, color: "red" | "green") => {
                        const priceStr = price.toString(); // Assuming two decimal places for price
                        const sizeStr = size.toString().padStart(maxBaseSizeLength, " ");
                        console.log(
                          priceStr + " " + `\u001b[3${color === "green" ? 2 : 1}m` + sizeStr + "\u001b[0m"
                        );
                    };

                    console.clear();
                    console.log("=================================");
                    console.log("Asks");
                    console.log("=================================");
                    asksArray.forEach(({ price, quantity }) => {
                        if (quantity != 0) {
                            printLine(price, quantity, "red");
                        }
                    });

                    console.log("=================================");
                    console.log("Bids");
                    console.log("=================================");
                    bidsArray.forEach(({ price, quantity }) => {
                        if (quantity != 0) {
                            printLine(price, quantity, "green");
                        }
                    });

                    this.lastOrderbookJson = currentOrderbookJson;
                }
            } catch (error) {
                console.error('Failed to fetch or process L2 Orderbook:', error);
            }
        }, intervalMs);
    }
}

(async () => {
    const watcher = new OrderbookWatcher;
    watcher.startWatching(); // Default polling interval set to 500 milliseconds
})();
