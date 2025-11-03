// ============ External Imports ============
import { BigNumber, ContractReceipt, ethers } from 'ethers';

// ============ Internal Imports ============
import { TransactionOptions } from '../types';
import { extractErrorMessage } from '../utils';

// ============ Config Imports ============
import orderbookAbi from '../../abi/OrderBook.json';
import buildTransactionRequest from '../utils/txConfig';

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
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();

        const orderbookInterface = new ethers.utils.Interface(orderbookAbi.abi);
        const data = orderbookInterface.encodeFunctionData('batchCancelOrders', [orderIds]);

        return buildTransactionRequest({
            to: orderbookAddress,
            from: address,
            data,
            txOptions,
            signer,
        });
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
        txOptions?: TransactionOptions,
    ): Promise<ContractReceipt> {
        try {
            const signer = providerOrSigner instanceof ethers.Signer ? providerOrSigner : providerOrSigner.getSigner();

            const tx = await OrderCanceler.constructCancelOrdersTransaction(
                signer,
                orderbookAddress,
                orderIds,
                txOptions,
            );

            const transaction = await signer.sendTransaction(tx);
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
        orderIds: BigNumber[],
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
