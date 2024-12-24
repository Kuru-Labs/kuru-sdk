import { ethers } from "ethers";
import { MonadDeployer } from "../../src/create/monadDeployer";
import { monadDeployerAddress, rpcUrl } from "../config.json";
import { ParamCreator } from "../../src/create/market";

async function main() {
    // Connect to provider with custom fetch
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY environment variable not set");
    }
    const signer = new ethers.Wallet(privateKey, provider);

    const monadDeployer = new MonadDeployer();
    const paramCreator = new ParamCreator();

    const tokenParams = {
        name: "Test Token",
        symbol: "TEST",
        tokenURI: "https://cdn.prod.website-files.com/667c57e6f9254a4b6d914440/667d7104644c621965495f6e_LogoMark.svg",
        initialSupply: ethers.utils.parseUnits("1000000", 18), // 1M tokens
        dev: await signer.getAddress(), // Developer address
        supplyToDev: ethers.BigNumber.from(1000), // 10% in basis points (bps)
    };

    // Calculate market parameters using ParamCreator
    const currentQuote = 1; // Current quote price
    const currentBase = 456789; // Current base amount
    const maxPrice = 10; // Maximum expected price
    const minSize = 0.01; // Minimum order size

    const precisions = paramCreator.calculatePrecisions(
        currentQuote,
        currentBase,
        maxPrice,
        minSize,
        10 // tickSizeBps
    );

    // Example market parameters using calculated precisions
    const marketParams = {
        nativeTokenAmount: ethers.utils.parseEther("1"), // 0.1 ETH for initial liquidity
        sizePrecision: precisions.sizePrecision,
        pricePrecision: precisions.pricePrecision,
        tickSize: precisions.tickSize,
        minSize: precisions.minSize,
        maxSize: precisions.maxSize,
        takerFeeBps: 30,    // 0.3%
        makerFeeBps: 10,    // 0.1%
    };

    try {
        // First construct the transaction to check parameters
        const tx = await MonadDeployer.constructDeployTokenAndMarketTransaction(
            signer,
            monadDeployerAddress,
            tokenParams,
            marketParams
        );

        console.log("Estimated gas limit:", tx.gasLimit?.toString());
        console.log("Total value to send:", ethers.utils.formatEther(tx.value || "0"), "MON");

        // Then deploy the token and market
        const result = await monadDeployer.deployTokenAndMarket(
            signer,
            monadDeployerAddress,
            tokenParams,
            marketParams
        );

        console.log("Deployment successful!");
        console.log("Token deployed at:", result.tokenAddress);
        console.log("Market deployed at:", result.marketAddress);
        
    } catch (error) {
        console.error("Error deploying token and market:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
