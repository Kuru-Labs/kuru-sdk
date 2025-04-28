// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { ParamFetcher, CostEstimator } from "../market";
import { PoolFetcher } from "../pools";
import { Pool, Route, RouteOutput } from "../types/pool";
import { MarketParams } from "../types";
import orderbookAbi from "../../abi/OrderBook.json";
import utilsAbi from "../../abi/KuruUtils.json";

export abstract class PathFinder {
    static async findBestPath(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        tokenIn: string,
        tokenOut: string,
        amountIn: number,
        amountType: "amountOut" | "amountIn" = "amountIn",
        poolFetcher?: PoolFetcher,
        pools?: Pool[],
        estimatorContractAddress?: string
    ): Promise<RouteOutput> {
        // Normalize input addresses to lowercase
        const normalizedTokenIn = tokenIn.toLowerCase();
        const normalizedTokenOut = tokenOut.toLowerCase();

        if (!pools) {
            if (!poolFetcher) {
                throw new Error("Either pools or poolFetcher must be provided");
            }
            pools = await poolFetcher.getAllPools(normalizedTokenIn, normalizedTokenOut);
        } else {
            // Normalize pool addresses
            pools = pools.map(pool => ({
                ...pool,
                orderbook: pool.orderbook.toLowerCase(),
                baseToken: pool.baseToken.toLowerCase(),
                quoteToken: pool.quoteToken.toLowerCase()
            }));
        }

        const routes = computeAllRoutes(normalizedTokenIn, normalizedTokenOut, pools);

        let bestRoute: RouteOutput = {
            route: {
                path: [],
                tokenIn: "",
                tokenOut: "",
            },
            isBuy: [],
            nativeSend: [],
            output: 0,
            priceImpact: 0,
            feeInBase: 0,
        };

        let bestOutput = 0;
        const routeOutputs = await Promise.all(
            routes.map(async route => 
                amountType === "amountOut"
                    ? await computeRouteInput(providerOrSigner, route, amountIn)
                    : await computeRouteOutput(providerOrSigner, route, amountIn)
            )
        );

        for (const routeOutput of routeOutputs) {
            if (routeOutput.output > bestOutput) {
                bestRoute = routeOutput;
                bestOutput = routeOutput.output;
            }
        }
        if (estimatorContractAddress) {
            const estimatorContract = new ethers.Contract(estimatorContractAddress, utilsAbi.abi, providerOrSigner);
            const orderbookAddresses = bestRoute.route.path.map(pool => pool.orderbook);
            const price = await estimatorContract.calculatePriceOverRoute(orderbookAddresses, bestRoute.isBuy);
            const priceInUnits = parseFloat(ethers.utils.formatUnits(price, 18));
            const actualPrice = parseFloat((amountIn / bestRoute.output).toFixed(18));
            const priceImpact = ((100 * actualPrice / priceInUnits) - 100).toFixed(2);
            bestRoute.priceImpact = parseFloat(priceImpact);
        }
        return bestRoute;
    }

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
}

function computeAllRoutes(
    tokenIn: string,
    tokenOut: string,
    pools: Pool[],
    currentPath: Pool[] = [],
    allPaths: Route[] = [],
    startTokenIn: string = tokenIn,
    maxHops = 2
): Route[] {
    for (const pool of pools) {
        if (currentPath.indexOf(pool) !== -1 || !involvesToken(pool, tokenIn))
            continue;

        const outputToken =
            pool.baseToken === tokenIn ? pool.quoteToken : pool.baseToken;
        if (outputToken === tokenOut) {
            allPaths.push({
                path: [...currentPath, pool],
                tokenIn: startTokenIn,
                tokenOut,
            });
        } else if (maxHops > 1) {
            computeAllRoutes(
                outputToken,
                tokenOut,
                pools,
                [...currentPath, pool],
                allPaths,
                startTokenIn,
                maxHops - 1
            );
        }
    }

    return allPaths;
}

async function computeRouteInput(
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

async function computeRouteOutput(
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

function involvesToken(pool: Pool, token: string): boolean {
    // Make comparison case insensitive
    const normalizedToken = token.toLowerCase();
    return pool.baseToken.toLowerCase() === normalizedToken || 
           pool.quoteToken.toLowerCase() === normalizedToken;
}
