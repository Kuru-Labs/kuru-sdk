import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import * as KuruConfig from "./../config.json";
import dotenv from "dotenv";
dotenv.config();

const { rpcUrl, routerAddress, baseTokenAddress, quoteTokenAddress } =
  KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

const args = process.argv.slice(2);
const size = parseFloat(args[0]);

(async () => {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  try {
    const routeOutput = await KuruSdk.PathFinder.findBestPath(
      provider,
      baseTokenAddress,
      quoteTokenAddress,
      size
    );

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
