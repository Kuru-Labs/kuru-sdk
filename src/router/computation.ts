// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { ParamFetcher } from "../market/marketParams";
import { CostEstimator } from "../market/estimator";
import { Route, RouteOutput } from "../types/pool";
import { MarketParams } from "../types";
import orderbookAbi from "../../abi/OrderBook.json";
import utilsAbi from "../../abi/KuruUtils.json";

export abstract class Computation {
    
    static async calculatePriceImpact(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        estimatorContractAddress: string,
        route: RouteOutput,
        amountIn: number
    ): Promise<number> {
        const estimatorContract = new ethers.Contract(
            estimatorContractAddress,
            utilsAbi.abi,
            providerOrSigner
        );
        const orderbookAddresses = route.route.path.map(pool => pool.orderbook);
        const price = await estimatorContract.calculatePriceOverRoute(
            orderbookAddresses,
            route.isBuy
        );
        const priceInUnits = parseFloat(ethers.utils.formatUnits(price, 18));
        const actualPrice = parseFloat((amountIn / route.output).toFixed(18));
        return parseFloat(((100 * actualPrice / priceInUnits) - 100).toFixed(2));
    }

    static async computeRouteInput(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        route: Route,
        amountOut: number,
        marketParamsMap?: Map<string, MarketParams>
    ) {
        let currentToken = route.tokenIn;
        let output: number = amountOut;
        let feeInBase: number = amountOut;
        let isBuy: boolean[] = [];
        let nativeSend: boolean[] = [];
        let priceImpact: number = 0;
        for (const pool of route.path) {
            const orderbookAddress = pool.orderbook;

            // Get market parameters from map if available, otherwise fetch them
            let poolMarketParams = marketParamsMap?.get(orderbookAddress);
            if (!poolMarketParams) {
                poolMarketParams = await ParamFetcher.getMarketParams(
                    providerOrSigner,
                    orderbookAddress
                );
            }

            const orderbook = new ethers.Contract(
                orderbookAddress,
                orderbookAbi.abi,
                providerOrSigner
            );

            const l2Book = await orderbook.getL2Book({
                from: ethers.constants.AddressZero,
            });
            const vaultParams = await orderbook.getVaultParams({
                from: ethers.constants.AddressZero,
            });

            currentToken === ethers.constants.AddressZero
                ? nativeSend.push(true)
                : nativeSend.push(false);
            if (currentToken === pool.baseToken) {
                // If the current token is the base token, we are selling base for quote
                output = await CostEstimator.estimateRequiredBaseForSell(
                    providerOrSigner,
                    orderbookAddress,
                    poolMarketParams,
                    output,
                    l2Book,
                    vaultParams
                );
                currentToken = pool.quoteToken; // Update current token to quote token
                isBuy.push(false);
            } else {
                // If the current token is the quote token, we are buying base with quote
                output = await CostEstimator.estimateRequiredQuoteForBuy(
                    providerOrSigner,
                    orderbookAddress,
                    poolMarketParams,
                    output,
                    l2Book,
                    vaultParams
                );
                currentToken = pool.baseToken; // Update current token to base token
                isBuy.push(true);
            }

            const takerFeesBps = Number(poolMarketParams.takerFeeBps._hex);
            feeInBase = (feeInBase * takerFeesBps) / 10000;
        }

        return {
            route,
            output,
            nativeSend,
            isBuy,
            feeInBase,
            priceImpact,
        };
    }

    static async computeRouteOutput(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        route: Route,
        amountIn: number,
        marketParamsMap?: Map<string, MarketParams>
    ): Promise<RouteOutput> {
        let currentToken = route.tokenIn;
        let output: number = amountIn;
        let feeInBase: number = amountIn;
        let isBuy: boolean[] = [];
        let nativeSend: boolean[] = [];
        let priceImpact: number = 1;

        for (const pool of route.path) {
            const orderbookAddress = pool.orderbook;

            // Get market parameters from map if available, otherwise fetch them
            let poolMarketParams = marketParamsMap?.get(orderbookAddress);
            if (!poolMarketParams) {
                poolMarketParams = await ParamFetcher.getMarketParams(
                    providerOrSigner,
                    orderbookAddress
                );
            }

            currentToken === ethers.constants.AddressZero
                ? nativeSend.push(true)
                : nativeSend.push(false);
            if (currentToken === pool.baseToken) {
                // If the current token is the base token, we are selling base for quote
                output = (await CostEstimator.estimateMarketSell(
                    providerOrSigner,
                    orderbookAddress,
                    poolMarketParams,
                    output
                )).output;
                currentToken = pool.quoteToken; // Update current token to quote token
                isBuy.push(false);
            } else {
                // If the current token is the quote token, we are buying base with quote
                output = (await CostEstimator.estimateMarketBuy(
                    providerOrSigner,
                    orderbookAddress,
                    poolMarketParams,
                    output
                )).output;
                currentToken = pool.baseToken; // Update current token to base token
                isBuy.push(true);
            }

            const takerFeesBps = Number(poolMarketParams.takerFeeBps._hex);
            feeInBase = (feeInBase * takerFeesBps) / 10000;
        }

        return {
            route,
            output,
            nativeSend,
            isBuy,
            priceImpact,
            feeInBase,
        };
    }
} 