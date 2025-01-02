// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage } from "../utils";
import { TransactionOptions } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";
import { getSigner } from "src/utils/signer";

export abstract class OrderCanceler {
    /**
     * @dev Constructs a transaction to cancel multiple orders.
     * @param signer - The signer instance to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param orderIds - An array of order IDs to be cancelled.
     * @param txOptions - Transaction options to be used for the transaction.
     * @returns A promise that resolves to the transaction request object.
     */
    static async constructCancelOrdersTransaction(
        signer: ethers.Signer,
        orderbookAddress: string,
        orderIds: BigInt[],
        txOptions?: TransactionOptions
    ): Promise<ethers.TransactionRequest> {
        const address = await signer.getAddress();

        const orderbookInterface = new ethers.Interface(orderbookAbi.abi);
        const data = orderbookInterface.encodeFunctionData("batchCancelOrders", [orderIds]);

        const tx: ethers.TransactionRequest = {
            to: orderbookAddress,
            from: address,
            data,
            ...(txOptions?.nonce !== undefined && { nonce: txOptions.nonce }),
            ...(txOptions?.gasLimit && { gasLimit: txOptions.gasLimit }),
            ...(txOptions?.gasPrice && { gasPrice: txOptions.gasPrice }),
            ...(txOptions?.maxFeePerGas && { maxFeePerGas: txOptions.maxFeePerGas }),
            ...(txOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: txOptions.maxPriorityFeePerGas })
        } as ethers.TransactionRequest;

        const [gasLimit, baseGasPrice] = await Promise.all([
            !tx.gasLimit ? signer.estimateGas({
                ...tx,
                gasPrice: ethers.parseUnits('1', 'gwei')
            }) : Promise.resolve(tx.gasLimit),
            (!tx.gasPrice && !tx.maxFeePerGas) ? (await signer.provider!.getFeeData()).gasPrice : Promise.resolve(undefined)
        ]);

        if (!tx.gasLimit) {
            tx.gasLimit = gasLimit;
        }

        if (!tx.gasPrice && !tx.maxFeePerGas && baseGasPrice) {
            if (txOptions?.priorityFee) {
                const priorityFeeWei = ethers.parseUnits(
                    txOptions.priorityFee.toString(),
                    'gwei'
                );
                tx.gasPrice = baseGasPrice + priorityFeeWei;
            } else {
                tx.gasPrice = baseGasPrice;
            }
        }

        return tx;
    }

    /**
     * @dev Cancels multiple orders by their IDs.
     * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param orderIds - An array of order IDs to be cancelled.
     * @param txOptions - Transaction options to be used for the transaction.
     * @returns A promise that resolves when the transaction is confirmed.
     */
    static async cancelOrders(
        providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
        orderbookAddress: string,
        orderIds: BigInt[],
        txOptions?: TransactionOptions
    ): Promise<ethers.TransactionReceipt> {
        try {
            // const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi.abi, providerOrSigner);
            
            const signer = await getSigner(providerOrSigner);
            
            const tx = await OrderCanceler.constructCancelOrdersTransaction(
                signer,
                orderbookAddress,
                orderIds,
                txOptions
            );

            const transaction = await signer.sendTransaction(tx);
            const receipt = await transaction.wait(1);

            return receipt!;
        } catch (e: any) {
            console.log({ e });
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }

    static async estimateGas(
        providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
        orderbookAddress: string,
        orderIds: BigInt[]
    ): Promise<BigInt> {
        try {
            const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi.abi, providerOrSigner);

            const gasEstimate = await orderbook.batchCancelOrders.estimateGas(orderIds);
            return gasEstimate;
        } catch (e: any) {
            console.log({ e });
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }
}
