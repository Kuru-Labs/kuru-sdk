// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { Order } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";

export abstract class Orders {
    /**
     * @dev Gets an order by its ID.
     * @param providerOrSigner - The ethers.js provider to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param orderId - The ID of the order.
     * @returns A promise that resolves to an Order object containing order details.
     */
    static async getOrder(
        providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
        orderbookAddress: string,
        orderId: number
    ): Promise<Order> {
        const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi.abi, providerOrSigner);

        const order: Order = await orderbook.s_orders(orderId, {from: ethers.ZeroAddress});

        return order;
    }
}
