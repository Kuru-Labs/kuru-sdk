// ============ Internal Imports ============
import { BaseToken } from "../types";

export class PairGenerator {
    /**
     * Generates direct pairs between two tokens
     * @param tokenIn - Input token address
     * @param tokenOut - Output token address
     * @returns Array of token pairs in both directions
     */
    static generateDirectPairs(
        tokenIn: string,
        tokenOut: string
    ): { baseToken: string; quoteToken: string }[] {
        return [
            { baseToken: tokenIn, quoteToken: tokenOut },
            { baseToken: tokenOut, quoteToken: tokenIn },
        ];
    }

    /**
     * Generates pairs between a token and a list of base tokens
     * @param token - Token address to pair with base tokens
     * @param baseTokens - List of base tokens
     * @returns Array of token pairs in both directions
     */
    static generateBaseTokenPairs(
        token: string,
        baseTokens: BaseToken[]
    ): { baseToken: string; quoteToken: string }[] {
        return baseTokens.flatMap((base) => [
            { baseToken: token, quoteToken: base.address },
            { baseToken: base.address, quoteToken: token },
        ]);
    }

    /**
     * Generates all possible combinations between base tokens
     * @param baseTokens - List of base tokens
     * @returns Array of token pairs in both directions
     */
    static generateBasePairCombinations(
        baseTokens: BaseToken[]
    ): { baseToken: string; quoteToken: string }[] {
        return baseTokens.flatMap((base1, index) =>
            baseTokens.slice(index + 1).flatMap((base2) => [
                { baseToken: base1.address, quoteToken: base2.address },
                { baseToken: base2.address, quoteToken: base1.address },
            ])
        );
    }

    /**
     * Generates all possible pairs for a given token pair and base tokens
     * @param tokenIn - Input token address
     * @param tokenOut - Output token address
     * @param baseTokens - List of base tokens
     * @returns Array of all possible token pairs
     */
    static generateAllPairs(
        tokenIn: string,
        tokenOut: string,
        baseTokens: BaseToken[]
    ): { baseToken: string; quoteToken: string }[] {
        return [
            ...this.generateDirectPairs(tokenIn, tokenOut),
            ...this.generateBaseTokenPairs(tokenIn, baseTokens),
            ...this.generateBaseTokenPairs(tokenOut, baseTokens),
            ...this.generateBasePairCombinations(baseTokens),
        ];
    }
} 