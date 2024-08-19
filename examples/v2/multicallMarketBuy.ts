import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "./../config.json";

const { rpcUrl, contractAddress } = KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

const args = process.argv.slice(2);
const size = parseFloat(args[0]);

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    const marketParams = await KuruSdk.ParamFetcher.getMarketParams(
        provider,
        contractAddress
    );

    await KuruSdk.IocMulticall.placeMarketMulticall(
        provider,
        contractAddress,
        marketParams,
        {
            size,
            isBuy: true,
            fillOrKill: true,
            approveTokens: false
        }
    );
})();
