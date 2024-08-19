// ============ External Imports ============
import { ethers, BigNumber } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage } from "../utils";
import { Orders } from "./orders";
import { ActiveOrders } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";

export abstract class OrderCanceler {
    /**
     * @dev Cancels multiple orders by their IDs.
     * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param orderIds - An array of order IDs to be cancelled.
     * @returns A promise that resolves when the transaction is confirmed.
     */
    static async cancelOrders(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        orderIds: BigNumber[]
    ): Promise<void> {
        try {
            const orderbook = new ethers.Contract(
                orderbookAddress,
                orderbookAbi.abi,
                providerOrSigner
            );

            const tx = await orderbook.batchCancelOrders(orderIds);
            await tx.wait();
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e.error.error.body);
        }
    }

    static async estimateGas(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        orderIds: BigNumber[]
    ): Promise<BigNumber> {
        try {
            const orderbook = new ethers.Contract(
                orderbookAddress,
                orderbookAbi.abi,
                providerOrSigner
            );

            const gasEstimate =
                await orderbook.estimateGas.batchCancelOrders(orderIds);
            return gasEstimate;
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e.error.error.body);
        }
    }

    /**
     * @dev Cancels all orders for a specific maker.
     * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param maker - The address of the maker whose orders should be cancelled.
     * @returns A promise that resolves to a list of orderIds of canceled orders.
     */
    static async cancelAllOrders(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        maker: string,
        activeOrdersForMaker: any
    ): Promise<ActiveOrders> {
        try {
            const activeOrders = await Orders.getActiveOrdersForMaker(
                providerOrSigner,
                orderbookAddress,
                maker,
                activeOrdersForMaker
            );

            await this.cancelOrders(
                providerOrSigner,
                orderbookAddress,
                activeOrders.orderIds
            );

            return activeOrders;
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e.error.error.body);
        }
    }

    /**
     * @dev Cancels all buy orders for a specific maker.
     * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param maker - The address of the maker whose buy orders should be cancelled.
     * @returns A promise that resolves to a list of orderIds of canceled orders.
     */
    static async cancelAllBuys(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        maker: string,
        activeBuysForMaker: any
    ): Promise<ActiveOrders> {
        try {
            const activeOrders = await Orders.getActiveBuysForMaker(
                providerOrSigner,
                orderbookAddress,
                maker,
                activeBuysForMaker
            );

            await this.cancelOrders(
                providerOrSigner,
                orderbookAddress,
                activeOrders.orderIds
            );

            return activeOrders;
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e.error.error.body);
        }
    }

    /**
     * @dev Cancels all sell orders for a specific maker.
     * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param maker - The address of the maker whose sell orders should be cancelled.
     * @returns A promise that resolves to a list of orderIds of canceled orders.
     */
    static async cancelAllSells(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        maker: string,
        activeSellsForMaker: any
    ): Promise<ActiveOrders> {
        try {
            const activeOrders = await Orders.getActiveSellsForMaker(
                providerOrSigner,
                orderbookAddress,
                maker,
                activeSellsForMaker
            );

            await this.cancelOrders(
                providerOrSigner,
                orderbookAddress,
                activeOrders.orderIds
            );

            return activeOrders;
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e.error.error.body);
        }
    }
}
