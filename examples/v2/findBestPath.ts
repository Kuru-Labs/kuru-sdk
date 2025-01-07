import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "./../config.json";
import { PoolFetcher } from "../../src/pools/fetcher";
import dotenv from "dotenv";
dotenv.config();

const { rpcUrl } = KuruConfig;

const kuruApi = process.env.KURU_API;

const args = process.argv.slice(2);
const amount = parseFloat(args[0]);

(async () => {
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    try {
        const pool = new PoolFetcher(kuruApi as string);
        const result = await pool.getAllPools(
            "0x266c56717Cad3ee549ea53bA75e14653C9748b40",
            "0xD18e0Fe99f3eB099C67aDE897a6bBbF02a5A68F9",
            [
                {
                    symbol: "MON",
                    address: "0x0000000000000000000000000000000000000000",
                },
                {
                    symbol: "USDC",
                    address: "0x266c56717Cad3ee549ea53bA75e14653C9748b40",
                },
            ]
        );

        const bestPath = await KuruSdk.PathFinder.findBestPath(
            provider,
            "0x266c56717Cad3ee549ea53bA75e14653C9748b40",
            "0xD18e0Fe99f3eB099C67aDE897a6bBbF02a5A68F9",
            amount,
            "amountIn",
            undefined,
            result
        );

        console.log(bestPath);
        console.log(bestPath.route.path);
        console.log(bestPath.output);
    } catch (error) {
        console.error("Error finding best path:", error);
    }
})();
