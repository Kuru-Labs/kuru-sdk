// ============ External Imports ============
import { ethers, BigNumber, ContractReceipt } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage } from "../utils";
import { TransactionOptions } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";

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
        orderIds: BigNumber[],
        txOptions?: TransactionOptions
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();

        const orderbookInterface = new ethers.utils.Interface(orderbookAbi.abi);
        const data = orderbookInterface.encodeFunctionData("batchCancelOrders", [orderIds]);

        const tx: ethers.providers.TransactionRequest = {
            to: orderbookAddress,
            from: address,
            data,
            ...(txOptions?.nonce !== undefined && { nonce: txOptions.nonce }),
            ...(txOptions?.gasLimit && { gasLimit: txOptions.gasLimit }),
            ...(txOptions?.gasPrice && { gasPrice: txOptions.gasPrice }),
            ...(txOptions?.maxFeePerGas && { maxFeePerGas: txOptions.maxFeePerGas }),
            ...(txOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: txOptions.maxPriorityFeePerGas })
        };

        const [gasLimit, baseGasPrice] = await Promise.all([
            !tx.gasLimit ? signer.estimateGas({
                ...tx,
                gasPrice: ethers.utils.parseUnits('1', 'gwei')
            }) : Promise.resolve(tx.gasLimit),
            (!tx.gasPrice && !tx.maxFeePerGas) ? signer.provider!.getGasPrice() : Promise.resolve(undefined)
        ]);

        if (!tx.gasLimit) {
            tx.gasLimit = gasLimit;
        }

        if (!tx.gasPrice && !tx.maxFeePerGas && baseGasPrice) {
            if (txOptions?.priorityFee) {
                const priorityFeeWei = ethers.utils.parseUnits(
                    txOptions.priorityFee.toString(),
                    'gwei'
                );
                tx.gasPrice = baseGasPrice.add(priorityFeeWei);
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
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        orderIds: BigNumber[],
        txOptions?: TransactionOptions
    ): Promise<ContractReceipt> {
        try {
            const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi.abi, providerOrSigner);
            
            const tx = await OrderCanceler.constructCancelOrdersTransaction(
                orderbook.signer,
                orderbookAddress,
                orderIds,
                txOptions
            );

            const transaction = await orderbook.signer.sendTransaction(tx);
            const receipt = await transaction.wait(1);

            return receipt;
        } catch (e: any) {
            console.log({ e });
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }

    static async estimateGas(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        orderIds: BigNumber[]
    ): Promise<BigNumber> {
        try {
            const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi.abi, providerOrSigner);

            const gasEstimate = await orderbook.estimateGas.batchCancelOrders(orderIds);
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
