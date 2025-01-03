import { ethers } from "ethers";
import { CostEstimator } from "../src/market/estimator";
import dotenv from "dotenv";
import { ParamFetcher } from "../src/market/marketParams";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);

async function testEstimatorSell() {
    const ORDERBOOK_ADDRESS = "0x0793992d027aa1b45471e7a901488e12b0c656ea"; // mon-usdc
    const marketParams = await ParamFetcher.getMarketParams(provider, ORDERBOOK_ADDRESS);
    const size = 10000;
    const amount = await CostEstimator.estimateMarketSell(provider, ORDERBOOK_ADDRESS, marketParams, size);
    console.log(amount);
}

async function testEstimatorBuy() {
    const ORDERBOOK_ADDRESS = "0x0793992d027aa1b45471e7a901488e12b0c656ea"; // mon-usdc
    const marketParams = await ParamFetcher.getMarketParams(provider, ORDERBOOK_ADDRESS);
    const size = 10000;
    const amount = await CostEstimator.estimateMarketBuy(provider, ORDERBOOK_ADDRESS, marketParams, size);
    console.log(amount);
}

testEstimatorSell();
testEstimatorBuy();