# Kuru SDK Documentation

The `@kuru-labs/kuru-sdk` provides various functionalities for interacting with the Kuru protocol. Below are examples of how to use the SDK for different operations.

## Installation

```bash
npm install @kuru-labs/kuru-sdk
```

## Configuration

Ensure you export your private key to use the examples
```bash
export PRIVATE_KEY=<0xpvt_key>
```

Ensure you export kuru api url
```bash
export KURU_API=<kuru_api_url>
```

## Example Usage for Orderbook


### Deposit

To deposit tokens into a margin account:

```typescript
import { ethers } from "ethers";

import * as KuruSdk from "../../src";

const rpcUrl = <your_rpc_url>; // RPC URL
const userAddress = <your_user_address>; // User address that funds will be deposited to
const marginAccountAddress = <your_margin_account_address>; // Margin account address
const tokenAddress = <token_address>; // Token address to deposit

const privateKey = process.env.PRIVATE_KEY as string;

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
	
    try {
        const receipt = await KuruSdk.MarginDeposit.deposit(
            signer,
            marginAccountAddress,
            userAddress,
            tokenAddress,
            10000,
            18,
            true
        );
        console.log("Transaction hash:", receipt.transactionHash);
    } catch (error: any) {
        console.error("Error depositing:", error);
    }
})();
```

### Place Limit Buy

To place a limit buy order:

```typescript
import { ethers } from "ethers";

import * as KuruSdk from "../../src";

const rpcUrl = <your_rpc_url>; // RPC URL
const marketAddress = <your_market_address>; // Market address

const privateKey = process.env.PRIVATE_KEY as string;

const price = 135.50; // Price in quoteAsset (ex:USDC)
const size = 10; // Size in baseAsset (ex:MON)

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    const marketParams = await KuruSdk.ParamFetcher.getMarketParams(provider, marketAddress);

    try {
        const receipt = await KuruSdk.GTC.placeLimit(
            signer,
            marketAddress,
            marketParams,
            {
                price,
                size,
                isBuy: true,
                postOnly: true
            }
        );
        console.log("Transaction hash:", receipt.transactionHash);
    } catch (error) {
        console.error("Error placing limit buy order:", error);
    }
})();
```

### Cancel Order

To cancel orders using the Kuru SDK:

```typescript
import { ethers, BigNumber } from "ethers";
import * as KuruSdk from "../../src";

const rpcUrl = <your_rpc_url>; // RPC URL
const marketAddress = <your_market_address>; // Market address

const privateKey = process.env.PRIVATE_KEY as string;

const orderIds = listOfOrderIds; // List of order ids to cancel

(async () => {
	const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    try {
        const txReceipt = await KuruSdk.OrderCanceler.cancelOrders(
            signer,
            marketAddress,
            orderIds.map(orderId => BigNumber.from(parseInt(orderId)))
        );

        console.log("Transaction hash:", txReceipt.transactionHash);
    } catch (err: any) {
        console.error("Error:", err);
    }
})();
```

### Estimate Buy

To estimate the baseAsset received for a buy order with X amount of quoteAsset:

```typescript
import { ethers } from "ethers";

import * as KuruSdk from "../../src";

const rpcUrl = <your_rpc_url>; // RPC URL
const marketAddress = <your_market_address>; // Market address

const amount = 100; // Amount of quoteAsset to spend (ex:USDC)

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    const marketParams = await KuruSdk.ParamFetcher.getMarketParams(provider, marketAddress);

	try {
		const estimate = await KuruSdk.CostEstimator.estimateMarketBuy(
			provider,
			marketAddress,
			marketParams,
			amount
		);

		console.log(estimate);
	} catch (error) {
		console.error("Error estimating market buy:", error);
	}
})();
```

### Estimate Base for Sell

To estimate the required baseAsset for a sell order to get X amount of quoteAsset:

```typescript
import { ethers } from "ethers";

import * as KuruSdk from "../../src";
import orderbookAbi from "../../abi/OrderBook.json";

const rpcUrl = <your_rpc_url>; // RPC URL
const marketAddress = <your_market_address>; // Market address  

const amount = 100; // Amount of quoteAsset to receive after selling (ex:USDC)

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    const marketParams = await KuruSdk.ParamFetcher.getMarketParams(provider, marketAddress);

    const orderbook = new ethers.Contract(marketAddress, orderbookAbi.abi, provider);
    const l2Book = await orderbook.getL2Book();
    const vaultParams = await orderbook.getVaultParams();
    

	try {
		const estimate = await KuruSdk.CostEstimator.estimateRequiredBaseForSell(
			provider,
			marketAddress,
			marketParams,
			amount,
			l2Book,
			vaultParams
		);

		console.log(estimate);
	} catch (error) {
		console.error("Error estimating required base for sell:", error);
	}
})();
```

### Market Buy

To perform a market buy:

```typescript
import { ethers } from "ethers";

import * as KuruSdk from "../../src";

const rpcUrl = <your_rpc_url>; // RPC URL
const marketAddress = <your_market_address>; // Market address

const privateKey = process.env.PRIVATE_KEY as string;

const size = 100; // Size in quoteAsset (ex:USDC)
const minAmountOut = 10; // Minimum amount of baseAsset to receive (ex:MON)

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    try {
        const marketParams = await KuruSdk.ParamFetcher.getMarketParams(
            provider,
            marketAddress
        );
        const receipt = await KuruSdk.IOC.placeMarket(signer, marketAddress, marketParams, {
            approveTokens: true,
            size,
            isBuy: true,
            minAmountOut,
            isMargin: false,
            fillOrKill: true,
        });
        console.log("Transaction hash:", receipt.transactionHash);
    } catch (error) {
        console.error("Error placing market buy order:", error);
    }
})();
```

## Example usage for Router

### Find Best Path

To find the best path for a swap and expected output:

```typescript
import { ethers } from "ethers";

import * as KuruSdk from "../../src";

const rpcUrl = <your_rpc_url>; // RPC URL

const amount = 100; // Amount of fromToken to swap (ex:USDC)

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    try {
        const bestPath = await KuruSdk.PathFinder.findBestPath(
            provider,
            <fromTokenAddress>,
            <toTokenAddress>,
            amount,
            "amountIn" // "amountIn" or "amountOut" 
        );

        console.log(bestPath);
        console.log(bestPath.route.path); // Route of best path
        console.log(bestPath.output); // Expected output
    } catch (error) {
        console.error("Error finding best path:", error);
    }
})();
```

### Swap

> **Important Note**: The current BASE_TOKENS constants are configured for the development environment. As this project is under active development, these values will change over time. For teams currently integrating: We recommend using the development environment setup. If you need to use a custom list of base tokens for your project, please use the pool fetcher (shown after this example) to fetch pools with your specific token list.

To perform a token swap:

```typescript
import { ethers } from "ethers";

import * as KuruSdk from "../../src";

const rpcUrl = <your_rpc_url>; // RPC URL
const fromTokenAddress = <your_from_token_address>; // From token address
const toTokenAddress = <your_to_token_address>; // To token address
const routerAddress = <kuru_router_address>; // Router address

const privateKey = process.env.PRIVATE_KEY as string;

const size = 100; // Size in fromToken (ex:USDC)

(async () => {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  try {
    const routeOutput = await KuruSdk.PathFinder.findBestPath(
      provider,
      fromTokenAddress,
      toTokenAddress,
      size
    );

    const receipt = await KuruSdk.TokenSwap.swap(
      signer,
      routerAddress,
      routeOutput,
      size,
      18, // In token decimals
      18, // Out token decimals
      3, // Slippage tolerance(in %)
      true, // Boolean indicating whether to approve tokens
      (txHash: string | null) => {
        console.log(`Transaction hash: ${txHash}`);
      } // Callback function for what to do after approval
    );
    console.log("Transaction hash:", receipt.transactionHash);
  } catch (error) {
    console.error("Error performing swap:", error);
  }
})();
```

## Example usage for Pool Fetching

### Find Pools with Custom Base

To find pools with custom base tokens:

```typescript
import { ethers } from "ethers";
import * as KuruSdk from "../../src";

const kuruApi = process.env.KURU_API as string;

// Define custom base tokens
const customBaseTokens = [
    { symbol: 'ETH', address: ethers.constants.AddressZero },
    { symbol: 'USDC', address: '0xb73472fF5a4799F7182CB8f60360de6Ec7BB9c94' }
];

(async () => {
    const poolFetcher = new KuruSdk.PoolFetcher(kuruApi);

    try {
        // Get all pools with custom base tokens
        const pools = await poolFetcher.getAllPools(
            <tokenInAddress>,
            <tokenOutAddress>,
            customBaseTokens // Optional
        );

        console.log("Found pools:", pools);
        // Each pool contains:
        // - baseToken: string (address)
        // - quoteToken: string (address)
        // - orderbook: string (address)
    } catch (error) {
        console.error("Error finding pools:", error);
    }
})();
```

## Market Creation

### Standard Market Creation

The standard market creation is more suitable when:
- You already have existing tokens
- You want to create markets between any two ERC20 tokens
- You need more control over the market parameters

Note: The tick size in BPS is recommended to be around 10 BPS for liquid tokens and 100 BPS for long-tail assets. For example, if you are pairing 50 million MON with 10 million USDC, a tick size of 10 BPS is recommended. 
If you are pairing 1 billion CHOG with say, 100 MON, we recommend a tick size of 100 BPS. This will allow limit orders to be created efficiently. 

To create a standard market using the ParamCreator:

```typescript
import { ethers } from "ethers";
import { ParamCreator } from "@kuru-labs/kuru-sdk";

const rpcUrl = <your_rpc_url>; // RPC URL
const routerAddress = <router_address>; // Router contract address
const baseTokenAddress = <base_token_address>; // Base token address
const quoteTokenAddress = <quote_token_address>; // Quote token address

const privateKey = process.env.PRIVATE_KEY as string;

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    const paramCreator = new ParamCreator();

    // Calculate market precisions based on current market data
    const precisions = paramCreator.calculatePrecisions(
        1, // Current quote price
        456789, // Current base amount
        10, // Maximum expected price
        0.01, // Minimum order size
        10 // Tick size in basis points (0.1%)
    );

    try {
        const marketAddress = await paramCreator.deployMarket(
            signer,
            routerAddress,
            1, // Market type
            baseTokenAddress,
            quoteTokenAddress,
            precisions.sizePrecision,
            precisions.pricePrecision,
            precisions.tickSize,
            precisions.minSize,
            precisions.maxSize,
            30, // Taker fee in basis points (0.3%)
            10, // Maker fee in basis points (0.1%)
            ethers.BigNumber.from(100) // AMM spread in basis points (1%)
        );

        console.log("Market deployed at:", marketAddress);
    } catch (error) {
        console.error("Error deploying market:", error);
    }
})();
```

### Native-Paired Market Creation

The MonadDeployer method is particularly useful when you want to:
- Create a new token and its corresponding market in one transaction
- Pair your token with the chain's native token (e.g., MON)
- Automatically set up initial liquidity with the native token

Note: For meme tokens, we recommend using the MonadDeployer with 100 BPS tick size.

Usage:

```typescript
import { ethers } from "ethers";
import { MonadDeployer, ParamCreator } from "@kuru-labs/kuru-sdk";

const rpcUrl = <your_rpc_url>; // RPC URL
const monadDeployerAddress = <monad_deployer_address>; // MonadDeployer contract address

const privateKey = process.env.PRIVATE_KEY as string;

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    
    const monadDeployer = new MonadDeployer();
    const paramCreator = new ParamCreator();

    // Token configuration
    const tokenParams = {
        name: "Your Token",
        symbol: "TOKEN",
        tokenURI: "https://your-token-uri.com/logo.svg",
        initialSupply: ethers.utils.parseUnits("1000000", 18), // 1M tokens
        dev: await signer.getAddress(),
        supplyToDev: ethers.BigNumber.from(0), // 0% to dev in basis points
    };
    //@note: Base amount should be subtracted accordingly to amount of tokens minted to the dev
    // Calculate market parameters
    const precisions = paramCreator.calculatePrecisions(
        1, // Current quote price
        456789, // Current base amount
        10, // Maximum expected price
        0.01, // Minimum order size
        10 // Tick size in basis points
    );

    // Market configuration
    const marketParams = {
        nativeTokenAmount: ethers.utils.parseEther("1"), // Initial liquidity
        sizePrecision: precisions.sizePrecision,
        pricePrecision: precisions.pricePrecision,
        tickSize: precisions.tickSize,
        minSize: precisions.minSize,
        maxSize: precisions.maxSize,
        takerFeeBps: 30, // 0.3%
        makerFeeBps: 10, // 0.1%
    };

    try {
        const result = await monadDeployer.deployTokenAndMarket(
            signer,
            monadDeployerAddress,
            tokenParams,
            marketParams
        );

        console.log("Token deployed at:", result.tokenAddress);
        console.log("Market deployed at:", result.marketAddress);
    } catch (error) {
        console.error("Error deploying token and market:", error);
    }
})();
```



