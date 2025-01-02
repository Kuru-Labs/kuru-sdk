import { ethers } from "ethers";
import { GTC } from "../src/market/gtc";
import { MarketParams } from "../src/types";

import dotenv from "dotenv";
import { ParamFetcher } from "../src/market/marketParams";
dotenv.config();

describe("GTC (Limit Orders) Integration Tests", () => {
  // Configuration
  const RPC_ENDPOINT = process.env.RPC_URL!;
  const PRIVATE_KEY = process.env.PK!;
  const ORDERBOOK_ADDRESS = "0x3a4cc34d6CC8b5E8aeb5083575aaa27F2a0A184A"; // mon-usdc
  
  let provider: ethers.JsonRpcProvider;
  let signer: ethers.Wallet;
  let marketParams: MarketParams;

  beforeAll(async () => {
    provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
    signer = new ethers.Wallet(PRIVATE_KEY, provider);

    marketParams = await ParamFetcher.getMarketParams(provider, ORDERBOOK_ADDRESS);
  });

  describe("Limit Order Tests", () => {
    it("should place a buy limit order", async () => {
      const order = {
        price: 1500.50,  // Price in quote asset
        size: 1.0,       // Size in base asset
        isBuy: true,
        postOnly: false,
        txOptions: undefined
      };

      const receipt = await GTC.placeLimit(
        signer,
        ORDERBOOK_ADDRESS,
        marketParams,
        order
      );

      expect(receipt.status).toBe(1);
    }, 30000);

    it("should place a sell limit order", async () => {
      const order = {
        price: 1600.75,
        size: 0.5,
        isBuy: false,
        postOnly: false,
        txOptions: undefined
      };

      const receipt = await GTC.placeLimit(
        signer,
        ORDERBOOK_ADDRESS,
        marketParams,
        order
      );

      expect(receipt.status).toBe(1);
    }, 30000);

    it("should estimate gas for buy limit order", async () => {
      const order = {
        price: 1500.50,
        size: 1.0,
        isBuy: true,
        postOnly: false,
        txOptions: undefined
      };

      const gasEstimate = await GTC.estimateGas(
        signer,
        ORDERBOOK_ADDRESS,
        marketParams,
        order
      );

      expect(typeof gasEstimate).toBe("bigint");
      expect(gasEstimate > BigInt(0)).toBe(true);
    });
  });

  describe("Error Cases", () => {
    it("should fail with invalid price precision", async () => {
      const order = {
        price: 1500.123456789, // Too many decimal places
        size: 1.0,
        isBuy: true,
        postOnly: false,
        txOptions: undefined
      };

      await expect(
        GTC.placeLimit(
          signer,
          ORDERBOOK_ADDRESS,
          marketParams,
          order
        )
      ).rejects.toThrow();
    });

    it("should fail with zero size", async () => {
      const order = {
        price: 1500.50,
        size: 0,
        isBuy: true,
        postOnly: false,
        txOptions: undefined
      };

      await expect(
        GTC.placeLimit(
          signer,
          ORDERBOOK_ADDRESS,
          marketParams,
          order
        )
      ).rejects.toThrow();
    });
  });
}); 