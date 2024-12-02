import { calculateDynamicSlippage } from "../../src/utils/slippage";

// Example OHLCV data (24 hour periods)
const sampleOHLCVData = [
    { close: 100, volume: 50000 },
    { close: 102, volume: 45000 },
    { close: 99, volume: 55000 },
    { close: 101, volume: 48000 },
    { close: 100.5, volume: 52000 }
];

// Example parameters
const defaultSlippageBps = 50; // 0.5% default slippage
const tradeSize = 1000; // Size of trade
const priceImpactBps = 200; // 0.2% estimated price impact

// Calculate optimal slippage
const optimalSlippageBps = calculateDynamicSlippage(
    defaultSlippageBps,
    tradeSize,
    priceImpactBps,
    sampleOHLCVData
);

console.log(`Calculated optimal slippage: ${optimalSlippageBps} bps (${optimalSlippageBps/100}%)`);

// Example with different market conditions
const volatileOHLCVData = [
    { close: 100, volume: 50000 },
    { close: 110, volume: 80000 }, // Large price swing
    { close: 95, volume: 90000 },  // Another large swing
    { close: 105, volume: 85000 }, 
    { close: 90, volume: 70000 }
];

const volatileSlippageBps = calculateDynamicSlippage(
    defaultSlippageBps,
    tradeSize,
    priceImpactBps,
    volatileOHLCVData
);

console.log(`Slippage in volatile conditions: ${volatileSlippageBps} bps (${volatileSlippageBps/100}%)`);
