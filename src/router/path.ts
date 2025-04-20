// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { ParamFetcher, CostEstimator } from "../market";
import { PoolFetcher } from "../pools";
import { Pool, Route, RouteOutput } from "../types/pool";
import orderbookAbi from "../../abi/OrderBook.json";
import utilsAbi from "../../abi/KuruUtils.json";

interface BaseToken {
    symbol: string;
    address: string;
}

export abstract class PathFinder {
    static async findBestPath(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        tokenIn: string,
        tokenOut: string,
        amountIn: number,
        amountType: "amountOut" | "amountIn" = "amountIn",
        poolFetcher?: PoolFetcher,
        customBaseTokens?: BaseToken[],
        estimatorContractAddress?: string
    ): Promise<RouteOutput> {
        // Normalize input addresses to lowercase
        const normalizedTokenIn = tokenIn.toLowerCase();
        const normalizedTokenOut = tokenOut.toLowerCase();

        try {
            // Call the API to get the best route structure
            const baseUrl = poolFetcher ? poolFetcher.getBaseUrl() : process.env.API_BASE_URL;
            if (!baseUrl) {
                throw new Error("No base URL available for API calls");
            }

            const response = await fetch(`${baseUrl}/api/v2/routes/best`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    tokenIn: normalizedTokenIn,
                    tokenOut: normalizedTokenOut,
                    amountIn,
                    amountType,
                    customBaseTokens
                }),
            });

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Unknown error from API');
            }

            const bestRoute = result.data;

            // Use existing functions to compute the actual output
            const routeOutput = amountType === "amountOut"
                ? await computeRouteInput(providerOrSigner, bestRoute.route, amountIn)
                : await computeRouteOutput(providerOrSigner, bestRoute.route, amountIn);

            // Calculate price impact if estimator contract is provided
            if (estimatorContractAddress) {
                const estimatorContract = new ethers.Contract(
                    estimatorContractAddress,
                    utilsAbi.abi,
                    providerOrSigner
                );
                const orderbookAddresses = bestRoute.route.path.map((pool: Pool) => pool.orderbook);
                const price = await estimatorContract.calculatePriceOverRoute(
                    orderbookAddresses,
                    routeOutput.isBuy
                );
                const priceInUnits = parseFloat(ethers.utils.formatUnits(price, 18));
                const actualPrice = parseFloat((amountIn / routeOutput.output).toFixed(18));
                routeOutput.priceImpact = parseFloat(((100 * actualPrice / priceInUnits) - 100).toFixed(2));
            }

            return routeOutput;
        } catch (error) {
            console.error('Error finding best path:', error);
            throw error;
        }
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
    amountOut: number
) {
    let currentToken = route.tokenIn;
    let output: number = amountOut;
    let feeInBase: number = amountOut;
    let isBuy: boolean[] = [];
    let nativeSend: boolean[] = [];
    let priceImpact: number = 0;
    for (const pool of route.path) {
        const orderbookAddress = pool.orderbook;

        // Fetch market parameters for the current orderbook
        const marketParams = await ParamFetcher.getMarketParams(
            providerOrSigner,
            orderbookAddress
        );

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
                marketParams,
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
                marketParams,
                output,
                l2Book,
                vaultParams
            );
            currentToken = pool.baseToken; // Update current token to base token
            isBuy.push(true);
        }

        const takerFeesBps = Number(marketParams.takerFeeBps._hex);
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
    amountIn: number
): Promise<RouteOutput> {
    let currentToken = route.tokenIn;
    let output: number = amountIn;
    let feeInBase: number = amountIn;
    let isBuy: boolean[] = [];
    let nativeSend: boolean[] = [];
    let priceImpact: number = 1;

    for (const pool of route.path) {
        const orderbookAddress = pool.orderbook;

        // Fetch market parameters for the current orderbook
        const marketParams = await ParamFetcher.getMarketParams(
            providerOrSigner,
            orderbookAddress
        );

        currentToken === ethers.constants.AddressZero
            ? nativeSend.push(true)
            : nativeSend.push(false);
        if (currentToken === pool.baseToken) {
            // If the current token is the base token, we are selling base for quote
            output = (await CostEstimator.estimateMarketSell(
                providerOrSigner,
                orderbookAddress,
                marketParams,
                output
            )).output;
            currentToken = pool.quoteToken; // Update current token to quote token
            isBuy.push(false);
        } else {
            // If the current token is the quote token, we are buying base with quote
            output = (await CostEstimator.estimateMarketBuy(
                providerOrSigner,
                orderbookAddress,
                marketParams,
                output
            )).output;
            currentToken = pool.baseToken; // Update current token to base token
            isBuy.push(true);
        }

        const takerFeesBps = Number(marketParams.takerFeeBps._hex);
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
