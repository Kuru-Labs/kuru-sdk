import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "./../config.json";

const { rpcUrl, baseTokenAddress, quoteTokenAddress } = KuruConfig;

const args = process.argv.slice(2);
const amount = parseFloat(args[0]);

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    const bestPath = await KuruSdk.PathFinder.findBestPath(
        provider,
        quoteTokenAddress,
        baseTokenAddress,
        amount,
        "amountOut"
    );

    console.log(bestPath);

    console.log(bestPath.route.path);
    console.log(bestPath.output);
})();
