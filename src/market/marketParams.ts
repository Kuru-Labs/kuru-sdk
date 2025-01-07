// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { MarketParams } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";

export abstract class ParamFetcher {
    /**
     * @dev Retrieves the market parameters from the order book contract.
     * @param providerOrSigner - The ethers.js provider to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @returns A promise that resolves to the market parameters.
     */
    static async getMarketParams(
        providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
        orderbookAddress: string
    ): Promise<MarketParams> {
        const orderbook = new ethers.Contract(
            orderbookAddress,
            orderbookAbi.abi,
            providerOrSigner
        );
        const marketParamsData = await orderbook.getMarketParams({from: ethers.ZeroAddress});
        return {
            pricePrecision: BigInt(marketParamsData[0]),
            sizePrecision: BigInt(marketParamsData[1]),
            baseAssetAddress: marketParamsData[2],
            baseAssetDecimals: BigInt(marketParamsData[3]),
            quoteAssetAddress: marketParamsData[4],
            quoteAssetDecimals: BigInt(marketParamsData[5]),
            tickSize: BigInt(marketParamsData[6]),
            minSize: BigInt(marketParamsData[7]),
            maxSize: BigInt(marketParamsData[8]),
            takerFeeBps: BigInt(marketParamsData[9]),
            makerFeeBps: BigInt(marketParamsData[10]),
        };
    }
}
