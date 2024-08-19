// ============ External Imports ============
import { ethers, BigNumber } from "ethers";

// ============ Internal Imports ============
import { ActiveOrders, Order } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";

export abstract class Orders {
    /**
     * @dev Gets active orders for a specific maker.
     * @param providerOrSigner - The ethers.js provider to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param maker - The address of the maker.
     * @returns A promise that resolves to an ActiveOrders object containing block number and order IDs.
     */
    static async getActiveOrdersForMaker(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        maker: string,
        activeOrdersForMaker: any
    ): Promise<ActiveOrders> {
        const orderbook = new ethers.Contract(
            orderbookAddress,
            orderbookAbi.abi,
            providerOrSigner
        );

        let data = activeOrdersForMaker;

        if (!data) {
            data = await orderbook.getActiveOrdersForAddress(maker);
        }
        let offset = 66;
        const blockNumber = parseInt(data.slice(2, 66), 16); // Extracting the block number from data
        let orderIds: BigNumber[] = [];

        while (offset < data.length) {
            const orderId = BigNumber.from(
                parseInt(data.slice(offset, offset + 64), 16)
            );
            offset += 64; // Each uint24 is padded to 64 bytes
            orderIds.push(orderId);
        }

        return { blockNumber, orderIds };
    }

    /**
     * @dev Gets an order by its ID.
     * @param providerOrSigner - The ethers.js provider to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param orderId - The ID of the order.
     * @returns A promise that resolves to an Order object containing order details.
     */
    static async getOrder(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        orderId: number
    ): Promise<Order> {
        const orderbook = new ethers.Contract(
            orderbookAddress,
            orderbookAbi.abi,
            providerOrSigner
        );

        const order: Order = await orderbook.s_orders(orderId);

        return order;
    }

    /**
     * @dev Gets active buy orders for a specific maker.
     * @param providerOrSigner - The ethers.js provider to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param maker - The address of the maker.
     * @returns A promise that resolves to an ActiveOrders object containing block number and order IDs.
     */
    static async getActiveBuysForMaker(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        maker: string,
        activeBuysForMaker: any
    ): Promise<ActiveOrders> {
        const orderbook = new ethers.Contract(
            orderbookAddress,
            orderbookAbi.abi,
            providerOrSigner
        );

        let data = activeBuysForMaker;

        if (!data) {
            data = await orderbook.getActiveBuysForAddress(maker);
        }

        let offset = 66;
        const blockNumber = parseInt(data.slice(2, 66), 16); // Extracting the block number from data
        let orderIds: BigNumber[] = [];

        while (offset < data.length) {
            const orderId = BigNumber.from(
                parseInt(data.slice(offset, offset + 64), 16)
            );
            offset += 64; // Each uint24 is padded to 64 bytes
            orderIds.push(orderId);
        }

        return { blockNumber, orderIds };
    }

    /**
     * @dev Gets active sell orders for a specific maker.
     * @param providerOrSigner - The ethers.js provider to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param maker - The address of the maker.
     * @returns A promise that resolves to an ActiveOrders object containing block number and order IDs.
     */
    static async getActiveSellsForMaker(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        maker: string,
        activeSellsForAddress: any
    ): Promise<ActiveOrders> {
        const orderbook = new ethers.Contract(
            orderbookAddress,
            orderbookAbi.abi,
            providerOrSigner
        );

        let data = activeSellsForAddress;

        if (!data) {
            data = await orderbook.getActiveSellsForAddress(maker);
        }

        let offset = 66;
        const blockNumber = parseInt(data.slice(2, 66), 16); // Extracting the block number from data
        let orderIds: BigNumber[] = [];

        while (offset < data.length) {
            const orderId = BigNumber.from(
                parseInt(data.slice(offset, offset + 64), 16)
            );
            offset += 64; // Each uint24 is padded to 64 bytes
            orderIds.push(orderId);
        }

        return { blockNumber, orderIds };
    }
}
