// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { PoolFetcher } from "../pools";
import { Pool, RouteOutput } from "../types/pool";
import utilsAbi from "../../abi/KuruUtils.json";

async function calculatePriceImpact(
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

        try {
            // Call the API to get the best route structure
            const baseUrl = poolFetcher?.getBaseUrl() || process.env.API_BASE_URL;
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
                    pools: pools?.map(pool => ({
                        ...pool,
                        orderbook: pool.orderbook.toLowerCase(),
                        baseToken: pool.baseToken.toLowerCase(),
                        quoteToken: pool.quoteToken.toLowerCase()
                    }))
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `API request failed with status ${response.status}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Unknown error from API');
            }

            const routeOutput = result.data;

            // Calculate price impact if estimator contract address is provided
            if (estimatorContractAddress) {
                routeOutput.priceImpact = await calculatePriceImpact(
                    providerOrSigner,
                    estimatorContractAddress,
                    routeOutput,
                    amountIn
                );
            }

            return routeOutput;
        } catch (error) {
            console.error('Error finding best path:', error);
            throw error;
        }
    }
}

