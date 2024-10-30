// ============ Internal Imports ============
import { ethers } from "ethers";
import { BaseToken, MarketResponse, Pool } from "../types/pool";
import https from 'https';

// Define your most important base tokens
const BASE_TOKENS: BaseToken[] = [
    { symbol: 'ETH', address: ethers.constants.AddressZero },
    { symbol: 'USDC', address: '0x266c56717Cad3ee549ea53bA75e14653C9748b40' },
    { symbol: 'USDT', address: '0x06cb962eb3c587e87950c7b6743fc2e97624dfcd' }
];

export class PoolFetcher {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
    }

    static async create(baseUrl: string): Promise<PoolFetcher> {
        return new PoolFetcher(baseUrl);
    }

    private addDirectPairs(tokenIn: string, tokenOut: string): { baseToken: string, quoteToken: string }[] {
        return [
            { baseToken: tokenIn, quoteToken: tokenOut },
            { baseToken: tokenOut, quoteToken: tokenIn }
        ];
    }

    private addBaseTokenPairs(token: string, baseTokens: BaseToken[]): { baseToken: string, quoteToken: string }[] {
        return baseTokens.flatMap(base => [
            { baseToken: token, quoteToken: base.address },
            { baseToken: base.address, quoteToken: token }
        ]);
    }

    private addBasePairCombinations(baseTokens: BaseToken[]): { baseToken: string, quoteToken: string }[] {
        return baseTokens.flatMap((base1, index) =>
            baseTokens.slice(index + 1).flatMap(base2 => [
                { baseToken: base1.address, quoteToken: base2.address },
                { baseToken: base2.address, quoteToken: base1.address }
            ])
        );
    }

    private async fetchMarketData(pairs: { baseToken: string, quoteToken: string }[]): Promise<MarketResponse> {
        return new Promise<MarketResponse>((resolve, reject) => {
            const req = https.request(
                `${this.baseUrl}/api/v1/markets/filtered`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    rejectUnauthorized: false,
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(e);
                        }
                    });
                }
            );

            req.on('error', (error) => reject(error));
            req.write(JSON.stringify({ pairs }));
            req.end();
        });
    }

    async getAllPools(
        tokenInAddress?: string, 
        tokenOutAddress?: string, 
        customBaseTokens?: BaseToken[]
    ): Promise<Pool[]> {
        try {
            let pairs: { baseToken: string, quoteToken: string }[] = [];
            const baseTokens = customBaseTokens || BASE_TOKENS;

            if (tokenInAddress && tokenOutAddress) {
                // Add direct pairs
                pairs.push(...this.addDirectPairs(tokenInAddress, tokenOutAddress));
                
                // Add pairs with base tokens
                pairs.push(
                    ...this.addBaseTokenPairs(tokenInAddress, baseTokens),
                    ...this.addBaseTokenPairs(tokenOutAddress, baseTokens)
                );
            }

            // Add base token combinations
            pairs.push(...this.addBasePairCombinations(baseTokens));

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
