import { ethers } from "ethers";
import dotenv from "dotenv";
import { PathFinder } from "../src/router/path";
import { TokenSwap } from "../src/router/swap";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);

async function testSwap() {
    const TOKEN_IN = "0x9A29e9Bab1f0B599d1c6C39b60a79596b3875f56";  // Example token address
    const TOKEN_OUT = "0xd82E4d2C0a3f26745b1f2f2b385c4C29bb36295e"; // Example token address
    const ROUTER_ADDRESS = "0x5b7eFCb3ebbde03625A92C67a87c5a58F046e64f"; // Router contract address
    
    try {
        // Amount to swap (example: 1.0 tokens)
        const amountIn = 10;
        
        // Find the best path for the swap
        const bestRoute = await PathFinder.findBestPath(
            provider,
            TOKEN_IN,
            TOKEN_OUT,
            amountIn
        );

        console.log("Best Route Found:", bestRoute);

        // Execute the swap
        const receipt = await TokenSwap.swap(
            provider,
            ROUTER_ADDRESS,
            bestRoute,
            amountIn,
            18, // Input token decimals (example: 18 for most tokens)
            18, // Output token decimals
            2,  // 1% slippage tolerance
            true, // Approve tokens
            (txHash) => console.log("Approval Transaction:", txHash), // Approval callback
        );

        console.log("Swap Transaction Receipt:", receipt);
    } catch (error) {
        console.error("Error during swap:", error);
    }
}

testSwap();