import { ethers } from "ethers";
import { ParamCreator } from "../../src/create/market";
import {routerAddress, rpcUrl, baseTokenAddress, quoteTokenAddress} from "../config.json";

async function main() {
    // Connect to provider with custom fetch
    const provider = new ethers.providers.JsonRpcProvider(
        rpcUrl,
        {
            name: "custom",
            chainId: 41454,
        }
    );

    // Add debug logging with elapsed time
    provider.pollingInterval = 100;
    // Get private key from environment variable
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY environment variable not set");
    }

    // Create signer
    const signer = new ethers.Wallet(privateKey, provider);

    const paramCreator = new ParamCreator();

    // Example parameters - adjust these based on your needs
    const type = 1; // Market type
    const baseAssetAddress = baseTokenAddress; // Base token address
    const quoteAssetAddress = quoteTokenAddress; // Quote token address

    // Calculate precisions based on current market data
    const currentQuote = 100000000000; // Current quote price from trades
    const currentBase = 1; // Current base amount from trades
    const maxPrice = 10; // Maximum expected price
    const tickSize = 0.01; // Minimum price movement
    const minSize = 0.01; // Minimum order size

    const precisions = paramCreator.calculatePrecisions(
        currentQuote,
        currentBase, 
        maxPrice,
        tickSize,
        minSize
    );
    console.log("Price precision", precisions.pricePrecision.toString());
    console.log("Size precision", precisions.sizePrecision.toString());
    console.log("Tick size", precisions.tickSize.toString());
    console.log("Min size", precisions.minSize.toString());
    console.log("Max size", precisions.maxSize.toString());
    const takerFeeBps = 30; // 0.3%
    const makerFeeBps = 10; // -0.1% (rebate)
    const kuruAmmSpread = ethers.BigNumber.from(100); // 1%
    try {
        const marketAddress = await paramCreator.deployMarket(
            signer,
            routerAddress,
            type,
            baseAssetAddress,
            quoteAssetAddress,
            precisions.sizePrecision,
            precisions.pricePrecision,
            precisions.tickSize,
            precisions.minSize,
            precisions.maxSize,
            takerFeeBps,
            makerFeeBps,
            kuruAmmSpread
        );

        console.log("Market deployed at:", marketAddress);
        console.log("Calculated precisions:", {
            pricePrecision: precisions.pricePrecision.toString(),
            sizePrecision: precisions.sizePrecision.toString(),
            tickSize: precisions.tickSize.toString(),
            minSize: precisions.minSize.toString(),
            maxSize: precisions.maxSize.toString()
        });
    } catch (error) {
        console.error("Error deploying market:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
