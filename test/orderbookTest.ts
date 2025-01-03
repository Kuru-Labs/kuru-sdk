import { ethers } from "ethers";
import { OrderBook } from "../src/market/orderBook";
import dotenv from "dotenv";
import { ParamFetcher } from "../src/market/marketParams";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);

async function testL2Book() {
    const ORDERBOOK_ADDRESS = "0x0793992d027aa1b45471e7a901488e12b0c656ea"; // mon-usdc
    const marketParams = await ParamFetcher.getMarketParams(
        provider,
        ORDERBOOK_ADDRESS
    );
    const l2Book = await OrderBook.getL2OrderBook(
        provider,
        ORDERBOOK_ADDRESS,
        marketParams
    );
    console.log(l2Book);
}

testL2Book();
