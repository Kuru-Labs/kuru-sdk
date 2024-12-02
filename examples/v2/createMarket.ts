import { ethers } from "ethers";
import { ParamCreator } from "../../src/create/market";
import config from "../config.json";

async function main() {
    const scriptStartTime = Date.now();
    console.log("Process ID:", process.pid);
    console.log("Creating market...");
    const startTime = scriptStartTime;

    // Connect to provider with custom fetch
    const provider = new ethers.providers.JsonRpcProvider(
        config.rpcUrl,
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
    const type = 0; // Market type
    const baseAssetAddress = "0x139e1D41943ee15dDe4DF876f9d0E7F85e26660A"; // Base token address
    const quoteAssetAddress = "0xC7143d5bA86553C06f5730c8dC9f8187a621A8D4"; // Quote token address

    // Calculate precisions based on current market data
    const currentQuote = 10000; // Current quote price from trades
    const currentBase = 1_000_000_000; // Current base amount from trades
    const maxPrice = 1; // Maximum expected price
    const tickSize = 0.001; // Minimum price movement
    const minSize = 1; // Minimum order size

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
            config.routerAddress,
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

        const endTime = Date.now();
        const timeElapsed = (endTime - startTime) / 1000; // Convert to seconds

        console.log("Market deployed at:", marketAddress);
        console.log("Calculated precisions:", {
            pricePrecision: precisions.pricePrecision.toString(),
            sizePrecision: precisions.sizePrecision.toString(),
            tickSize: precisions.tickSize.toString(),
            minSize: precisions.minSize.toString(),
            maxSize: precisions.maxSize.toString()
        });
        console.log(`Time taken to create market: ${timeElapsed.toFixed(2)} seconds`);
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
