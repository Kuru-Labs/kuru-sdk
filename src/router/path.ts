// ============ Internal Imports ============
import { PoolFetcher } from "../pools";
import { Pool, RouteOutput } from "../types/pool";

export abstract class PathFinder {
    static async findBestPath(
        tokenIn: string,
        tokenOut: string,
        amountIn: number,
        amountType: "amountOut" | "amountIn" = "amountIn",
        poolFetcher?: PoolFetcher,
        pools?: Pool[],
        estimatorContractAddress?: string,
        rpcUrl?: string
    ): Promise<RouteOutput> {
        // Normalize input addresses to lowercase
        const normalizedTokenIn = tokenIn.toLowerCase();
        const normalizedTokenOut = tokenOut.toLowerCase();

        try {
            // Call the API to get the best route structure
            const baseUrl = poolFetcher?.getBaseUrl();
            if (!baseUrl) {
                throw new Error("PoolFetcher must be initialized with a valid base URL");
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
                    estimatorContractAddress,
                    rpcUrl,
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

            return result.data;
        } catch (error) {
            console.error('Error finding best path:', error);
            throw error;
        }
    }
}

