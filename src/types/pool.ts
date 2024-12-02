export interface Pool {
    baseToken: string;
    quoteToken: string;
    orderbook: string;
}

export interface Route {
    path: Pool[];
    tokenIn: string;
    tokenOut: string;
}

export interface RouteOutput {
    route: Route;
    isBuy: boolean[];
    nativeSend: boolean[];
    output: number;
    feeInBase: number;
}

export interface SlippageOptions {
    defaultSlippageBps: number;
    tradeSize: number;
    priceImpactBps: number;
    ohlcvData: { close: number, volume: number }[];
}

export interface MarketResponse {
    data: Array<{
        baseasset: string;
        quoteasset: string;
        market: string;
    }>;
    pagination: {
        limit: number;
        offset: number;
        total: number;
    };
}

// Add interfaces for base tokens
export interface BaseToken {
    symbol: string;
    address: string;
}
