import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "./../config.json";
import dotenv from "dotenv";
import { BaseToken } from "../../src";
dotenv.config();

const { rpcUrl, routerAddress, baseTokenAddress, quoteTokenAddress } =
  KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

// const args = process.argv.slice(2);
// const size = parseFloat(args[0]);
const size = 10;
(async () => {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  // Define custom base tokens
  const customBaseTokens: BaseToken[] = [
    { symbol: "ETH", address: ethers.ZeroAddress },
    { symbol: "USDC", address: "0x9A29e9Bab1f0B599d1c6C39b60a79596b3875f56" },
  ];

  try {

    const poolFetcher = new KuruSdk.PoolFetcher(process.env.KURU_API as string);
    const pools = await poolFetcher.getAllPools(
      baseTokenAddress,
      quoteTokenAddress,
      customBaseTokens
  );

    const routeOutput = await KuruSdk.PathFinder.findBestPath(
      provider,
      baseTokenAddress,
      quoteTokenAddress,
      size,
      "amountIn",
      undefined,
      pools
    );

    console.log(routeOutput);

    const receipt = await KuruSdk.TokenSwap.swap(
      signer,
      routerAddress,
      routeOutput,
      size,
      18,
      18,
      10,
      true,
      (txHash: string | null) => {
        console.log(`Transaction hash: ${txHash}`);
      }
    );
    console.log("Transaction hash:", receipt.hash);
  } catch (error) {
    console.error("Error performing swap:", error);
  }
})();
