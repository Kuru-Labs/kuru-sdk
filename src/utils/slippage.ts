/**
 * Calculates optimal slippage tolerance in basis points (BPS)
 * @param defaultSlippageBps - Default slippage tolerance in BPS (e.g., 50 = 0.5%)
 * @param tradeSize - Size of the trade
 * @param priceImpactBps - Price impact in BPS
 * @param ohlcvData - OHLCV data for the asset
 * @returns Optimal slippage tolerance in BPS
 */
export function calculateDynamicSlippage(
    defaultSlippageBps: number,
    tradeSize: number,
    priceImpactBps: number,
    ohlcvData: { close: number, volume: number }[]
): number {
    const MIN_SLIPPAGE_BPS = 5;
    const MAX_SLIPPAGE_BPS = 200;
    
    // Calculate volatility component
    const returns = ohlcvData.slice(1).map((data, i) => 
        Math.log(data.close / ohlcvData[i].close)
    );
    const volatility = calculateStandardDeviation(returns);
    
    // Calculate volume component (trade size relative to average volume)
    const avgVolume = ohlcvData.reduce((sum, d) => sum + d.volume, 0) / ohlcvData.length;
    const volumeRatio = tradeSize / avgVolume;
    
    // Combine factors: base slippage + volatility adjustment + volume impact + price impact
    let dynamicSlippage = defaultSlippageBps * (
        1 + 
        volatility * 2 + // Volatility factor
        Math.sqrt(volumeRatio) * 0.5 + // Volume impact
        priceImpactBps / 100 // Direct price impact
    );

    return Math.min(Math.max(dynamicSlippage, MIN_SLIPPAGE_BPS), MAX_SLIPPAGE_BPS);
}

function calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
}
