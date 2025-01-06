import { ethers } from "ethers";
import { PoolFetcher } from "../../src/pools/fetcher";
import { BaseToken } from "../../src/types/pool";

const kuruApi = "https://api.staging.kuru.io:3001";

// Get command line arguments
const args = process.argv.slice(2);
const tokenInAddress = args[0];
const tokenOutAddress = args[1];

// Define custom base tokens
const customBaseTokens: BaseToken[] = [
    { symbol: "ETH", address: ethers.ZeroAddress },
    { symbol: "USDC", address: "0x9A29e9Bab1f0B599d1c6C39b60a79596b3875f56" },
];

(async () => {
    const poolFetcher = new PoolFetcher(kuruApi);

    try {
        // Get all pools with custom base tokens
        const pools = await poolFetcher.getAllPools(
            tokenInAddress,
            tokenOutAddress,
            customBaseTokens
        );

        console.log("Found pools:");
        pools.forEach((pool, index) => {
            console.log(`\nPool ${index + 1}:`);
            console.log(`Base Token: ${pool.baseToken}`);
            console.log(`Quote Token: ${pool.quoteToken}`);
            console.log(`Orderbook: ${pool.orderbook}`);
        });
    } catch (error) {
        console.error("Error finding pools:", error);
    }
})();
