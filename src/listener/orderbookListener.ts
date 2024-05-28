import { ethers } from "ethers";

import {TradeEvent, OrderEvent} from "../types/types";
import orderbookAbi from "../../abi/OrderBook.json";

export class MarketListener {
	private contract: ethers.Contract;

	constructor(
		rpcUrl: string,
		contractAddress: string,
	) {
		const provider = new ethers.JsonRpcProvider(rpcUrl);
		this.contract = new ethers.Contract(contractAddress, orderbookAbi.abi, provider);
	}

	async listenForOrders(callback: (order: OrderEvent) => void) {
		this.contract.on(
			"OrderCreated",
			async (
				orderId: number,
				ownerAddress: string,
				size: number,
				price: number,
				isBuy: boolean
			) => {
                callback({orderId, ownerAddress, size, price, isBuy});
            }
		);
	}

    async listenForTrades(callback: (trade: TradeEvent) => void) {
		this.contract.on(
			"Trade",
			async (
				orderId: number,
				isBuy: boolean,
				price: number,
				updatedSize: number,
                takerAddress: string,
				filledSize: number,
			) => {
                callback({orderId, isBuy, price, updatedSize, takerAddress, filledSize});
            }
		);
	}
}