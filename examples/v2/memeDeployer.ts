import { ethers } from "ethers";
import { MonadDeployer } from "../../src/create/monadDeployer";
import { monadDeployerAddress, rpcUrl } from "../config.json";

async function main() {
    // Connect to provider with custom fetch
    const provider = new ethers.providers.JsonRpcProvider(
        rpcUrl,
        {
            name: "custom",
            chainId: 41454,
        }
    );

    // Get private key from environment variable
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY environment variable not set");
    }

    // Create signer
    const signer = new ethers.Wallet(privateKey, provider);

    // Initialize MonadDeployer SDK
    const monadDeployer = new MonadDeployer();

    // Example token parameters
    const tokenParams = {
        name: "Test Token",
        symbol: "TEST",
        tokenURI: "ipfs://QmTest",
        initialSupply: ethers.utils.parseUnits("1000000", 18), // 1M tokens
        dev: await signer.getAddress(), // Developer address
        supplyToDev: ethers.BigNumber.from(1000), // 10% in basis points (bps)
    };

    // Example market parameters
    const marketParams = {
        nativeTokenAmount: ethers.utils.parseEther("0.1"), // 0.1 ETH for initial liquidity
        sizePrecision: ethers.BigNumber.from("1000000"), // 6 decimals
        pricePrecision: 6,  // 6 decimals
        tickSize: 1,        // minimum price movement
        minSize: ethers.BigNumber.from("100000"),  // minimum trade size
        maxSize: ethers.BigNumber.from("100000000000"), // maximum trade size
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
