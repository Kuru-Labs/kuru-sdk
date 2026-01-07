import { BatchLPDetails, Position } from './positionViewer';

export interface LPSummary {
    bids: Position[];
    asks: Position[];
    quoteLiquidity: bigint;
    baseLiquidity: bigint;
}

export async function getLPSummaryForMinSize(
    batchLPDetails: BatchLPDetails,
    minSize: bigint,
    sizePrecision: bigint,
    pricePrecision: bigint,
    quoteAssetDecimals: bigint,
): Promise<LPSummary> {
    // Find smallest liquidity in bids
    let smallestBidSize: bigint | null = null;
    for (const bid of batchLPDetails.bids) {
        if (smallestBidSize === null || bid.liquidity < smallestBidSize) {
            smallestBidSize = bid.liquidity;
        }
    }

    // Find smallest liquidity in asks
    let smallestAskSize: bigint | null = null;
    for (const ask of batchLPDetails.asks) {
        if (smallestAskSize === null || ask.liquidity < smallestAskSize) {
            smallestAskSize = ask.liquidity;
        }
    }

    // Scale bids: replace smallest with minSize, scale others proportionally
    const scaledBids: Position[] = batchLPDetails.bids.map((position) => {
        if (smallestBidSize === null || smallestBidSize === BigInt(0)) {
            return { ...position };
        }
        const minSizeAtPrice =
            (minSize * position.price * BigInt(10) ** quoteAssetDecimals) / (pricePrecision * sizePrecision);
        return {
            ...position,
            liquidity: (position.liquidity * minSizeAtPrice) / smallestBidSize,
        };
    });

    // Scale asks: replace smallest with minSize, scale others proportionally
    const scaledAsks: Position[] = batchLPDetails.asks.map((position) => {
        if (smallestAskSize === null || smallestAskSize === BigInt(0)) {
            return { ...position };
        }
        return {
            ...position,
            liquidity: (position.liquidity * minSize) / smallestAskSize,
        };
    });

    return {
        bids: scaledBids,
        asks: scaledAsks,
        quoteLiquidity: scaledBids.reduce((sum, bid) => sum + bid.liquidity, BigInt(0)),
        baseLiquidity: scaledAsks.reduce((sum, ask) => sum + ask.liquidity, BigInt(0)),
    };
}

const FEE_DENOMINATOR = BigInt(10000);

/**
 * Calculates the minimum and maximum price range for symmetric liquidity provision
 * around the best ask price.
 *
 * @param bestAskPrice - The current best ask price in price precision
 * @param tickSize - The tick size in price precision
 * @param numPricePoints - Total number of price points (will be split evenly for bids and asks)
 * @param feeTierBps - Fee tier in basis points (e.g., 30 for 0.30%)
 * @returns Object with minPrice and maxPrice in price precision
 */
export function getMinAndMaxPrice(
    bestAskPrice: bigint,
    tickSize: bigint,
    numPricePoints: number,
    feeTierBps: bigint,
): { minPrice: bigint; maxPrice: bigint } {
    // Split price points evenly between bids and asks
    const pointsPerSide = Math.floor(numPricePoints / 2);

    if (pointsPerSide === 0) {
        return { minPrice: bestAskPrice, maxPrice: bestAskPrice };
    }

    // Calculate max price (asks go upward from bestAskPrice)
    // First ask is at bestAskPrice, so we need (pointsPerSide - 1) iterations
    // to reach the last ask price
    let maxPrice = bestAskPrice;
    for (let i = 0; i < pointsPerSide - 1; i++) {
        let nextPrice = (maxPrice * (FEE_DENOMINATOR + feeTierBps)) / FEE_DENOMINATOR;
        // Align to tick size
        nextPrice = nextPrice - (nextPrice % tickSize);
        // If price didn't change after alignment, move up by one tick
        if (nextPrice === maxPrice) {
            nextPrice = maxPrice + tickSize;
        }
        maxPrice = nextPrice;
    }

    // Calculate min price (bids go downward from one tick below bestAskPrice)
    // First, find the highest bid price (one step down from bestAskPrice)
    let minPrice = bestAskPrice - (bestAskPrice % tickSize);
    if (minPrice === bestAskPrice) {
        minPrice = bestAskPrice - tickSize;
    }

    // Now go backwards for the remaining bid positions
    // We already have the first bid, so we need (pointsPerSide - 1) more steps
    for (let i = 0; i < pointsPerSide - 1; i++) {
        // To go backwards, we divide by (1 + fee), which is equivalent to:
        // prevPrice = (currentPrice * FEE_DENOMINATOR) / (FEE_DENOMINATOR + feeTierBps)
        let prevPrice = (minPrice * FEE_DENOMINATOR) / (FEE_DENOMINATOR + feeTierBps);
        // Align to tick size
        prevPrice = prevPrice - (prevPrice % tickSize);
        // If price didn't change after alignment, move down by one tick
        if (prevPrice === minPrice) {
            prevPrice = minPrice - tickSize;
        }
        minPrice = prevPrice;
    }

    return { minPrice, maxPrice };
}
