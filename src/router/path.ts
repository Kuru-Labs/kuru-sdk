// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { ParamFetcher, CostEstimator } from "../market";
import { PoolFetcher } from "../pools";
import { Pool, Route, RouteOutput } from "../types/pool";

export abstract class PathFinder {
	static async findBestPath(
		providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
		tokenIn: string,
		tokenOut: string,
		amountIn: number,
		amountType: "quote" | "base" = "base"
	): Promise<RouteOutput> {
		const pools = await PoolFetcher.getAllPools();

		const routes = computeAllRoutes(tokenIn, tokenOut, pools);

		let bestRoute: RouteOutput = {
			route: {
				path: [],
				tokenIn: "",
				tokenOut: "",
			},
			isBuy: [],
			nativeSend: [],
			output: 0,
			feeInBase: 0,
		};

		console.log(JSON.stringify(routes, null, 2));

		if (amountType === "quote") {
			let bestInput = 0;

			for (const route of routes.reverse()) {
				const routeOutput = await computeRouteInput(
					providerOrSigner,
					route,
					amountIn
				);

				console.log(JSON.stringify(routeOutput, null, 2));

				if (routeOutput.output > bestInput) {
					bestRoute = routeOutput;
					bestInput = routeOutput.output;
				}
			}
		} else {
			let bestOutput = 0;
			for (const route of routes) {
				const routeOutput = await computeRouteOutput(
					providerOrSigner,
					route,
					amountIn
				);

				console.log(JSON.stringify(routeOutput, null, 2));

				if (routeOutput.output > bestOutput) {
					bestRoute = routeOutput;
					bestOutput = routeOutput.output;
				}
			}
		}

		return bestRoute;
	}
}

function computeAllRoutes(
	tokenIn: string,
	tokenOut: string,
	pools: Pool[],
	currentPath: Pool[] = [],
	allPaths: Route[] = [],
	startTokenIn: string = tokenIn,
	maxHops = 2
): Route[] {
	for (const pool of pools) {
		if (currentPath.indexOf(pool) !== -1 || !involvesToken(pool, tokenIn))
			continue;

		const outputToken =
			pool.baseToken === tokenIn ? pool.quoteToken : pool.baseToken;
		if (outputToken === tokenOut) {
			allPaths.push({
				path: [...currentPath, pool],
				tokenIn: startTokenIn,
				tokenOut,
			});
		} else if (maxHops > 1) {
			computeAllRoutes(
				outputToken,
				tokenOut,
				pools,
				[...currentPath, pool],
				allPaths,
				startTokenIn,
				maxHops - 1
			);
		}
	}

	return allPaths;
}

async function computeRouteInput(
	providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
	route: Route,
	amountOut: number
) {
	let currentToken = route.tokenIn;
	let output: number = amountOut;
	let feeInBase: number = amountOut;
	let isBuy: boolean[] = [];
	let nativeSend: boolean[] = [];

	for (const pool of route.path) {
		const orderbookAddress = pool.orderbook;

		// Fetch market parameters for the current orderbook
		const marketParams = await ParamFetcher.getMarketParams(
			providerOrSigner,
			orderbookAddress
		);

		currentToken === ethers.constants.AddressZero
			? nativeSend.push(true)
			: nativeSend.push(false);
		if (currentToken === pool.baseToken) {
			// If the current token is the base token, we are selling base for quote
			output = await CostEstimator.estimateRequiredQuoteForBuy(
				providerOrSigner,
				orderbookAddress,
				marketParams,
				output
			);
			currentToken = pool.quoteToken; // Update current token to quote token
			isBuy.push(false);
		} else {
			// If the current token is the quote token, we are buying base with quote
			output = await CostEstimator.estimateRequiredBaseForSell(
				providerOrSigner,
				orderbookAddress,
				marketParams,
				output
			);
			currentToken = pool.baseToken; // Update current token to base token
			isBuy.push(true);
		}

		feeInBase = (feeInBase * pool.takerFeeBps) / 10000;
	}

	return {
		route,
		output,
		nativeSend,
		isBuy,
		feeInBase,
	};
}

async function computeRouteOutput(
	providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
	route: Route,
	amountIn: number
): Promise<RouteOutput> {
	let currentToken = route.tokenIn;
	let output: number = amountIn;
	let feeInBase: number = amountIn;
	let isBuy: boolean[] = [];
	let nativeSend: boolean[] = [];

	for (const pool of route.path) {
		const orderbookAddress = pool.orderbook;

		// Fetch market parameters for the current orderbook
		const marketParams = await ParamFetcher.getMarketParams(
			providerOrSigner,
			orderbookAddress
		);

		currentToken === ethers.constants.AddressZero
			? nativeSend.push(true)
			: nativeSend.push(false);
		if (currentToken === pool.baseToken) {
			// If the current token is the base token, we are selling base for quote
			output = await CostEstimator.estimateMarketSell(
				providerOrSigner,
				orderbookAddress,
				marketParams,
				output
			);
			currentToken = pool.quoteToken; // Update current token to quote token
			isBuy.push(false);
		} else {
			// If the current token is the quote token, we are buying base with quote
			output = await CostEstimator.estimateMarketBuy(
				providerOrSigner,
				orderbookAddress,
				marketParams,
				output
			);
			currentToken = pool.baseToken; // Update current token to base token
			isBuy.push(true);
		}

		feeInBase = (feeInBase * pool.takerFeeBps) / 10000;
	}

	return {
		route,
		output,
		nativeSend,
		isBuy,
		feeInBase,
	};
}

function involvesToken(pool: Pool, token: string): boolean {
	return pool.baseToken === token || pool.quoteToken === token;
}
