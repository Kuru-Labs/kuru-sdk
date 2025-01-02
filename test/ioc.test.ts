import { ethers } from "ethers";
import { IOC } from "../src/market/ioc";
import { MarketParams } from "../src/types";

import dotenv from "dotenv";
import { ParamFetcher } from "../src/market/marketParams";
dotenv.config();

describe("IOC (Market Orders) Integration Tests", () => {
  // Configuration
  const RPC_ENDPOINT = process.env.RPC_URL!;
  const PRIVATE_KEY = process.env.PK!;
  const ORDERBOOK_ADDRESS = "0x0793992d027aa1b45471e7a901488e12b0c656ea"; // mon-usdc
  
  let provider: ethers.JsonRpcProvider;
  let signer: ethers.Wallet;
  let marketParams: MarketParams;

  beforeAll(async () => {
    provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
    signer = new ethers.Wallet(PRIVATE_KEY, provider);
    
    marketParams = await ParamFetcher.getMarketParams(provider, ORDERBOOK_ADDRESS);
  });

  describe("Market Order Tests", () => {

    it("should execute a market buy order", async () => {
      const order = {
        size: 100, // Amount of quote asset to spend
        minAmountOut: 90, // Minimum base asset to receive
        isBuy: true,
        fillOrKill: false,
        approveTokens: true,
        isMargin: true,
        txOptions: undefined
      };

      const receipt = await IOC.placeMarket(
        signer,
        ORDERBOOK_ADDRESS,
        marketParams,
        order
      );

      console.log(receipt);

      expect(receipt.status).toBe(1);
    }, 30000);

    it("should execute a market sell order", async () => {
      const order = {
        size: 50, // Amount of base asset to sell
        minAmountOut: 4, // Minimum quote asset to receive
        isBuy: false,
        fillOrKill: false,
        approveTokens: true,
        isMargin: true,
        txOptions: undefined
      };

      const receipt = await IOC.placeMarket(
        signer,
        ORDERBOOK_ADDRESS,
        marketParams,
        order
      );
      console.log(receipt);
      expect(receipt.status).toBe(1);
    }, 30000);

    it("should estimate gas for market buy", async () => {
      const order = {
        size: 1,
        minAmountOut: 0.5,
        isBuy: true,
        fillOrKill: false,
        approveTokens: false,
        isMargin: false,
        txOptions: undefined
      };

      const gasEstimate = await IOC.estimateGas(
        signer,
        ORDERBOOK_ADDRESS,
        marketParams,
        order,
        1 // 1% slippage tolerance
      );

      expect(typeof gasEstimate).toBe("bigint");
      expect(gasEstimate > BigInt(0)).toBe(true);
    });
  });

  describe("Fill-or-Kill Tests", () => {
    it("should execute fill-or-kill market buy", async () => {
      const order = {
        size: 1,
        minAmountOut: 0.5,
        isBuy: true,
        fillOrKill: true,
        approveTokens: true,
        isMargin: false,
        txOptions: undefined
      };

      const receipt = await IOC.placeMarket(
        signer,
        ORDERBOOK_ADDRESS,
        marketParams,
        order
      );

      expect(receipt.status).toBe(1);
    }, 30000);
  });

  describe("Error Cases", () => {
    it("should fail when minAmountOut is too high", async () => {
      const order = {
        size: 1000,
        minAmountOut: 999999, // Unrealistically high minimum output
        isBuy: true,
        fillOrKill: false,
        approveTokens: true,
        isMargin: false,
        txOptions: undefined
      };

      await expect(
        IOC.placeMarket(
          signer,
          ORDERBOOK_ADDRESS,
          marketParams,
          order
        )
      ).rejects.toThrow();
    });

    it("should fail with insufficient balance", async () => {
      const order = {
        size: 1000000, // Very large amount
        minAmountOut: 99999,
        isBuy: true,
        fillOrKill: false,
        approveTokens: true,
        isMargin: false,
        txOptions: undefined
      };

      await expect(
        IOC.placeMarket(
          signer,
          ORDERBOOK_ADDRESS,
          marketParams,
          order
        )
      ).rejects.toThrow();
    });
  });
}); 