import { BatchLPDetails, Position } from './positionViewer';

export interface LPSummary {
    bids: Position[];
    asks: Position[];
    quoteLiquidity: bigint;
    baseLiquidity: bigint;
}

export async function getLPSummaryForMinSize(batchLPDetails: BatchLPDetails, minSize: bigint): Promise<LPSummary> {
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
        return {
            ...position,
            liquidity: (position.liquidity * minSize) / smallestBidSize,
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
        quoteLiquidity: batchLPDetails.quoteLiquidity,
        baseLiquidity: batchLPDetails.baseLiquidity,
    };
}
