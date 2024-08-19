// ============ External Imports ============
import { ethers, BigNumber } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage, log10BigNumber } from "../utils";
import { MarketParams, BATCH } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";

export abstract class OrderBatcher {
    /**
     * @dev Batch updates the order book by placing multiple buy and sell limit orders and canceling existing orders.
     * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param marketParams - The market parameters including price and size precision.
     * @param batchUpdate - The batch update object containing limit orders and order IDs to cancel.
     * @returns A promise that resolves when the transaction is confirmed.
     */
    static async batchUpdate(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        marketParams: MarketParams,
        batchUpdate: BATCH
    ): Promise<void> {
        const orderbook = new ethers.Contract(
            orderbookAddress,
            orderbookAbi.abi,
            providerOrSigner
        );

        // Initialize arrays for buy and sell prices and sizes
        const buyPrices: BigNumber[] = [];
        const buySizes: BigNumber[] = [];
        const sellPrices: BigNumber[] = [];
        const sellSizes: BigNumber[] = [];

        // Separate the limit orders into buy and sell arrays
        for (const order of batchUpdate.limitOrders) {
            const priceBn: BigNumber = ethers.utils.parseUnits(
                order.price.toString(),
                log10BigNumber(marketParams.pricePrecision)
            );
            const sizeBn: BigNumber = ethers.utils.parseUnits(
                order.size.toString(),
                log10BigNumber(marketParams.sizePrecision)
            );

            if (order.isBuy) {
                buyPrices.push(priceBn);
                buySizes.push(sizeBn);
            } else {
                sellPrices.push(priceBn);
                sellSizes.push(sizeBn);
            }
        }

        // Call the smart contract function
        try {
            const tx = await orderbook.batchUpdate(
                buyPrices,
                buySizes,
                sellPrices,
                sellSizes,
                batchUpdate.cancelOrders,
                batchUpdate.postOnly
            );

            await tx.wait();
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e.error.error.body);
        }
    }
}
