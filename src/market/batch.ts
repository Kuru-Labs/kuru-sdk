// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage, log10BigNumber } from "../utils";
import { MarketParams, BATCH } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";
import { getSigner } from "src/utils/signer";

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
        providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
        orderbookAddress: string,
        marketParams: MarketParams,
        batchUpdate: BATCH
    ): Promise<ethers.TransactionReceipt> {
        const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi.abi, providerOrSigner);

        // Initialize arrays for buy and sell prices and sizes
        const buyPrices: BigInt[] = [];
        const buySizes: BigInt[] = [];
        const sellPrices: BigInt[] = [];
        const sellSizes: BigInt[] = [];

        // Separate the limit orders into buy and sell arrays
        for (const order of batchUpdate.limitOrders) {
            const pricePrecision = log10BigNumber(marketParams.pricePrecision);
            const sizePrecision = log10BigNumber(marketParams.sizePrecision);
            
            // Round the numbers to their respective precisions before parsing
            const priceStr = Number(order.price).toFixed(pricePrecision);
            const sizeStr = Number(order.size).toFixed(sizePrecision);
            
            const priceBn: BigInt = ethers.parseUnits(priceStr, pricePrecision);
            const sizeBn: BigInt = ethers.parseUnits(sizeStr, sizePrecision);

            if (order.isBuy) {
                buyPrices.push(priceBn);
                buySizes.push(sizeBn);
            } else {
                sellPrices.push(priceBn);
                sellSizes.push(sizeBn);
            }
        }

        try {
            
            const signer = await getSigner(providerOrSigner);

            const address = await signer.getAddress();

            const data = orderbook.interface.encodeFunctionData("batchUpdate", [
                buyPrices,
                buySizes,
                sellPrices,
                sellSizes,
                batchUpdate.cancelOrders,
                batchUpdate.postOnly
            ]);

            const tx: ethers.TransactionRequest = {
                to: orderbook.target,
                from: address,
                data,
                ...(batchUpdate.txOptions?.nonce !== undefined && { nonce: batchUpdate.txOptions.nonce }),
                ...(batchUpdate.txOptions?.gasLimit && { gasLimit: batchUpdate.txOptions.gasLimit }),
                ...(batchUpdate.txOptions?.gasPrice && { gasPrice: batchUpdate.txOptions.gasPrice }),
                ...(batchUpdate.txOptions?.maxFeePerGas && { maxFeePerGas: batchUpdate.txOptions.maxFeePerGas }),
                ...(batchUpdate.txOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: batchUpdate.txOptions.maxPriorityFeePerGas })
            } as ethers.TransactionRequest;

            const [gasLimit, baseGasPrice] = await Promise.all([
                !tx.gasLimit ? signer.estimateGas({
                    ...tx,
                    gasPrice: ethers.parseUnits('1', 'gwei'),
                }) : Promise.resolve(tx.gasLimit),
                (!tx.gasPrice && !tx.maxFeePerGas) ? (await signer.provider!.getFeeData()).gasPrice : Promise.resolve(undefined)
            ]);

            if (!tx.gasLimit) {
                tx.gasLimit = gasLimit;
            }

            if (!tx.gasPrice && !tx.maxFeePerGas && baseGasPrice) {
                if (batchUpdate.txOptions?.priorityFee) {
                    const priorityFeeWei = ethers.parseUnits(
                        batchUpdate.txOptions.priorityFee.toString(),
                        'gwei'
                    );
                    tx.gasPrice = baseGasPrice + priorityFeeWei;
                } else {
                    tx.gasPrice = baseGasPrice;
                }
            }

            const transaction = await signer.sendTransaction(tx);
            const receipt = await transaction.wait();

            return receipt!;
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }
}
