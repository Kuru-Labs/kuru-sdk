// ============ External Imports ============
import { ethers } from "ethers";
import {
    Multicall,
    ContractCallResults,
    ContractCallContext,
} from 'ethereum-multicall';

// ============ Internal Imports ============
import { extractErrorMessage, log10BigNumber } from "../utils";
import { MarketParams, MARKET } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";
import erc20Abi from "../../abi/IERC20.json";

export abstract class IocMulticall {
    /**
     * @dev Places a market order (buy or sell) using a multicall to reduce the number of transactions.
     * @param provider - The ethers.js provider to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param marketParams - The market parameters including price and size precision.
     * @param order - The market order object containing isBuy, size, and fillOrKill properties.
     * @returns A promise that resolves when the multicall transaction is confirmed.
     */
    static async placeMarketMulticall(
        provider: ethers.providers.Provider,
        orderbookAddress: string,
        marketParams: MarketParams,
        order: MARKET,
    ): Promise<void> {
        try {
            const multicall = new Multicall({ ethersProvider: provider, tryAggregate: true });
            const sizeInPrecision = ethers.utils.parseUnits(
                order.size.toString(),
                log10BigNumber(order.isBuy ? marketParams.pricePrecision : marketParams.sizePrecision)
            );
            const sizeInDecimals = ethers.utils.parseUnits(
                order.size.toString(),
                order.isBuy ? marketParams.quoteAssetDecimals : marketParams.baseAssetDecimals
            );
            
            const calls: ContractCallContext[] = [
                {
                    reference: 'approveToken',
                    contractAddress: order.isBuy ? marketParams.quoteAssetAddress : marketParams.baseAssetAddress,
                    abi: erc20Abi.abi,
                    calls: [{
                        reference: 'approveCall',
                        methodName: 'approve',
                        methodParameters: [orderbookAddress, sizeInDecimals]
                    }]
                },
                {
                    reference: 'placeMarketBuy',
                    contractAddress: orderbookAddress,
                    abi: orderbookAbi.abi,
                    calls: [{
                        reference: 'marketBuyCall',
                        methodName: order.isBuy ? 'placeAndExecuteMarketBuy' : 'placeAndExecuteMarketSell',
                        methodParameters: [sizeInPrecision, order.minAmountOut, order.isMargin, order.fillOrKill]
                    }]
                }
            ];

            const results: ContractCallResults = await multicall.call(calls);
            console.log(results.results.approveToken)
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e.error.error.body);
        }
    }
}
