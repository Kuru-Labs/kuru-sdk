import { Position } from './positionViewer';

export const getBidsAndAsksForSpotLiquidity = (
    bestAskPrice: bigint,
    endPrice: bigint,
    startPrice: bigint,
    tickSize: bigint,
    minFeesBps: bigint,
    FEE_DENOMINATOR: bigint,
) => {
    const bids: Position[] = [];
    const asks: Position[] = [];

    const maxPrice = Math.min(Number(bestAskPrice), Number(endPrice));

    while (startPrice < maxPrice) {
        var nextPrice = (startPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
        nextPrice = nextPrice - (nextPrice % tickSize);
        if (nextPrice == startPrice) {
            nextPrice = startPrice + tickSize;
        }
        var flipPrice = (nextPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
        flipPrice = flipPrice - (flipPrice % tickSize);
        if (flipPrice == nextPrice) {
            flipPrice = nextPrice + tickSize;
        }

        const position = {
            price: startPrice,
            liquidity: BigInt(0),
            flipPrice,
        };
        bids.push(position);

        startPrice = nextPrice;
    }

    while (startPrice < endPrice) {
        var flipPrice =
            (startPrice * (FEE_DENOMINATOR - minFeesBps) * (FEE_DENOMINATOR - minFeesBps)) /
            (FEE_DENOMINATOR * FEE_DENOMINATOR);
        if (flipPrice == startPrice) {
            flipPrice = startPrice - tickSize;
        }
        flipPrice = flipPrice - (flipPrice % tickSize);

        const position = {
            price: startPrice,
            liquidity: BigInt(0),
            flipPrice,
        };
        asks.push(position);

        var nextPrice = (startPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
        nextPrice = nextPrice - (nextPrice % tickSize);
        if (nextPrice == startPrice) {
            nextPrice = startPrice + tickSize;
        }

        startPrice = nextPrice;
    }

    return { bids, asks };
};

export const getBidsAndAsksForCurveLiquidity = (
    bestAskPrice: bigint,
    endPrice: bigint,
    startPrice: bigint,
    tickSize: bigint,
    minFeesBps: bigint,
    FEE_DENOMINATOR: bigint,
) => {
    const bids: Position[] = [];
    const asks: Position[] = [];
    let currentPrice = startPrice;

    const maxPrice = Math.min(Number(bestAskPrice), Number(endPrice));

    // #############################################################
    // # 1. Generate Bid & Ask Position Grids
    // #############################################################
    while (currentPrice < maxPrice) {
        let nextPrice = (currentPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
        nextPrice = nextPrice - (nextPrice % tickSize);
        if (nextPrice === currentPrice) nextPrice = currentPrice + tickSize;

        var flipPrice = (nextPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
        flipPrice = flipPrice - (flipPrice % tickSize);
        if (flipPrice == nextPrice) {
            flipPrice = nextPrice + tickSize;
        }

        bids.push({ price: currentPrice, liquidity: BigInt(0), flipPrice });
        currentPrice = nextPrice;
    }

    while (currentPrice < endPrice) {
        var flipPrice =
            (currentPrice * (FEE_DENOMINATOR - minFeesBps) * (FEE_DENOMINATOR - minFeesBps)) /
            (FEE_DENOMINATOR * FEE_DENOMINATOR);
        if (flipPrice == currentPrice) {
            flipPrice = currentPrice - tickSize;
        }
        flipPrice = flipPrice - (flipPrice % tickSize);

        asks.push({ price: currentPrice, liquidity: BigInt(0), flipPrice });

        let nextPrice = (currentPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
        nextPrice = nextPrice - (nextPrice % tickSize);
        if (nextPrice === currentPrice) nextPrice = currentPrice + tickSize;

        currentPrice = nextPrice;
    }

    return { bids, asks };
};

export const getBidsAndAsksForBidAskLiquidity = (
    bestAskPrice: bigint,
    endPrice: bigint,
    startPrice: bigint,
    tickSize: bigint,
    minFeesBps: bigint,
    FEE_DENOMINATOR: bigint,
) => {
    const bids: Position[] = [];
    const asks: Position[] = [];

    let currentPrice = startPrice;

    const maxPrice = Math.min(Number(bestAskPrice), Number(endPrice));

    // #############################################################
    // # 1. Generate Bid & Ask Position Grids
    // #############################################################
    // Bids are created from the farthest price (startPrice) inwards to the center.
    while (currentPrice < maxPrice) {
        let nextPrice = (currentPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
        nextPrice = nextPrice - (nextPrice % tickSize);
        if (nextPrice === currentPrice) nextPrice = currentPrice + tickSize;

        var flipPrice = (nextPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
        flipPrice = flipPrice - (flipPrice % tickSize);
        if (flipPrice == nextPrice) {
            flipPrice = nextPrice + tickSize;
        }

        bids.push({ price: currentPrice, liquidity: BigInt(0), flipPrice });
        currentPrice = nextPrice;
    }

    // Asks are created from the center outwards to the farthest price (endPrice).
    while (currentPrice < endPrice) {
        var flipPrice =
            (currentPrice * (FEE_DENOMINATOR - minFeesBps) * (FEE_DENOMINATOR - minFeesBps)) /
            (FEE_DENOMINATOR * FEE_DENOMINATOR);
        if (flipPrice == currentPrice) {
            flipPrice = currentPrice - tickSize;
        }
        flipPrice = flipPrice - (flipPrice % tickSize);

        asks.push({ price: currentPrice, liquidity: BigInt(0), flipPrice });

        let nextPrice = (currentPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
        nextPrice = nextPrice - (nextPrice % tickSize);
        if (nextPrice === currentPrice) nextPrice = currentPrice + tickSize;

        currentPrice = nextPrice;
    }

    return { bids, asks };
};
