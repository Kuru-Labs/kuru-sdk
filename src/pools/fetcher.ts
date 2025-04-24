// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { BaseToken, Pool, MarketResponse } from "../types";
import { PairGenerator } from "./pairGenerator";
import fetch from "cross-fetch";

// Define your most important base tokens
const BASE_TOKENS: BaseToken[] = [
    { symbol: "MON", address: ethers.constants.AddressZero },
    { symbol: "WMON", address: "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701" },
    { symbol: "USDC", address: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea" },
    { symbol: "kuruUSDC", address: "0x6C15057930e0d8724886C09e940c5819fBE65465" },
];

export class PoolFetcher {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
    }

    static async create(baseUrl: string): Promise<PoolFetcher> {
        return new PoolFetcher(baseUrl);
    }

    getBaseUrl(): string {
        return this.baseUrl;
    }

    private async fetchMarketData(
        pairs: { baseToken: string; quoteToken: string }[]
    ): Promise<MarketResponse> {
        try {
            const response = await fetch(
                `${this.baseUrl}/api/v1/markets/filtered`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ pairs }),
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return (await response.json()) as MarketResponse;
        } catch (error) {
            throw new Error(
                `Failed to fetch market data: ${JSON.stringify(error)}`
            );
        }   
    }

    async getAllPools(
        tokenInAddress?: string,
        tokenOutAddress?: string,
        customBaseTokens?: BaseToken[]
    ): Promise<Pool[]> {
        try {
            const baseTokens = customBaseTokens || BASE_TOKENS;
            const pairs = PairGenerator.generateAllPairs(
                tokenInAddress || '',
                tokenOutAddress || '',
                baseTokens
            );

            const data = await this.fetchMarketData(pairs);

            return data.data.map((market) => ({
                baseToken: market.baseasset,
                quoteToken: market.quoteasset,
                orderbook: market.market,
            }));
        } catch (error) {
            console.error("Error fetching pools:", error);
            throw error;
        }
    }
}
