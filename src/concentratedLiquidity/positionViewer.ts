// ============ Types ============
export interface BatchLPDetails {
    bids: Position[];
    asks: Position[];
    quoteLiquidity: bigint;
    baseLiquidity: bigint;
}

export interface Position {
    price: bigint;
    flipPrice: bigint;
    liquidity: bigint;
}

const FEE_DENOMINATOR = BigInt(10000);

export abstract class PositionViewer {
    /**
     * @dev Retrieves details for concentrated liquidity positions within a price range.
     * @param minFeesBps - The minimum fees to filter positions by.
     * @param startPrice - The lower bound of the price range to query.
     * @param endPrice - The upper bound of the price range to query.
     * @param bestAskPrice - The current market price.
     * @param pricePrecision - The precision of the price.
     * @param tickSize - The size of a tick.
     * @param quoteLiquidity - The total quote liquidity in the market.
     * @param baseLiquidity - The total base liquidity in the market.
     * @param maxPricePoints - The maximum number of price points to prevent infinite loop.
     * @returns A promise that resolves to the batch order details.
     */
    static async getSpotBatchLPDetails(
        minFeesBps: bigint,
        startPrice: bigint,
        endPrice: bigint,
        bestAskPrice: bigint,
        pricePrecision: bigint,
        sizePrecision: bigint,
        quoteAssetDecimals: bigint,
        baseAssetDecimals: bigint,
        tickSize: bigint,
        minSize: bigint,
        quoteLiquidity?: bigint, // In quote asset decimals
        baseLiquidity?: bigint, // In base asset decimals
        maxPricePoints?: number, // max number price points to prevent infinite loop
    ): Promise<BatchLPDetails> {
        if (maxPricePoints !== undefined) {
            // Enforce that startPrice * (1 + minFeesBps/FEE_DENOMINATOR)^maxPricePoints < endPrice
            // This is equivalent to: startPrice * (FEE_DENOMINATOR + minFeesBps)^maxPricePoints < endPrice * FEE_DENOMINATOR^maxPricePoints

            let maxReachablePrice = startPrice;
            let feeDenominatorPower = BigInt(1);
            let feeNumeratorPower = BigInt(1);

            // Calculate (FEE_DENOMINATOR + minFeesBps)^maxPricePoints and FEE_DENOMINATOR^maxPricePoints
            for (let i = 0; i < maxPricePoints; i++) {
                feeNumeratorPower *= FEE_DENOMINATOR + minFeesBps;
                feeDenominatorPower *= FEE_DENOMINATOR;
            }

            maxReachablePrice = (startPrice * feeNumeratorPower) / feeDenominatorPower;

            if (maxReachablePrice <= endPrice) {
                throw new Error(
                    `maxPricePoints constraint violated: maximum reachable price (${maxReachablePrice}) would exceed or equal endPrice (${endPrice})`,
                );
            }
        }
        // don't allow both quoteLiquidity and baseLiquidity to be undefined
        if (quoteLiquidity === undefined && baseLiquidity === undefined) {
            throw new Error('quoteLiquidity and baseLiquidity cannot be undefined');
        }

        startPrice = startPrice - (startPrice % tickSize);

        var numBids: bigint = BigInt(0);
        var numAsks: bigint = BigInt(0);
        const bids: Position[] = [];
        const asks: Position[] = [];

        const maxPrice = Math.min(Number(bestAskPrice), Number(endPrice));

        while (startPrice < maxPrice) {
            numBids++;
            var nextPrice = (startPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
            if (nextPrice == startPrice) {
                nextPrice = startPrice + tickSize;
            }
            nextPrice = nextPrice - (nextPrice % tickSize);
            var flipPrice = (nextPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
            if (flipPrice == nextPrice) {
                flipPrice = nextPrice + tickSize;
            }
            flipPrice = flipPrice - (flipPrice % tickSize);

            const position = {
                price: startPrice,
                liquidity: BigInt(0),
                flipPrice,
            };
            bids.push(position);

            startPrice = nextPrice;
        }

        while (startPrice < endPrice) {
            numAsks++;
            var nextPrice = (startPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
            if (nextPrice == startPrice) {
                nextPrice = startPrice + tickSize;
            }
            nextPrice = nextPrice - (nextPrice % tickSize);

            var flipPrice = (startPrice * (FEE_DENOMINATOR - minFeesBps)) / FEE_DENOMINATOR;
            if (flipPrice == startPrice) {
                flipPrice = startPrice - tickSize;
            }
            flipPrice = flipPrice - (flipPrice % tickSize);

            // Prevent asks from exceeding the specified endPrice
            if (nextPrice > endPrice) {
                break;
            }
            const position = {
                price: nextPrice,
                liquidity: BigInt(0),
                flipPrice,
            };
            asks.push(position);

            startPrice = nextPrice;
        }

        if (quoteLiquidity !== undefined && baseLiquidity == undefined) {
            baseLiquidity = BigInt(0);
            const quotePerTick = quoteLiquidity / numBids;

            for (const bid of bids) {
                bid.liquidity = this.normalizeBidSize(
                    bid.price,
                    sizePrecision,
                    (quotePerTick * sizePrecision * pricePrecision) / (bid.price * BigInt(10) ** quoteAssetDecimals),
                );
                if (bid.liquidity < minSize) {
                    throw new Error('bid liquidity is less than minSize');
                }
            }

            for (const ask of asks) {
                ask.liquidity =
                    (quotePerTick * sizePrecision * pricePrecision) / (ask.price * BigInt(10) ** quoteAssetDecimals);
                baseLiquidity += (ask.liquidity * BigInt(10) ** baseAssetDecimals) / sizePrecision;
                if (ask.liquidity < minSize) {
                    throw new Error('ask liquidity is less than minSize');
                }
            }

            return {
                bids: bids.sort((a, b) => Number(b.price - a.price)),
                asks: asks.sort((a, b) => Number(b.price - a.price)),
                quoteLiquidity: quoteLiquidity ?? BigInt(0),
                baseLiquidity: baseLiquidity ?? BigInt(0),
            };
        }

        if (baseLiquidity !== undefined && quoteLiquidity == undefined) {
            // We have total base liquidity but need to infer the amount of quote
            // per price-point (i.e. quotePerTick) such that each bid/ask bucket
            // receives the same amount of quote.  The relationship between the
            // base size at the first ask (b₁) and the total base B is
            //   B = Σ_{i=1}^{N} (b₁ * p₁) / p_i
            // Solving for the constant quotePerTick = b₁ * p₁ gives
            //   quotePerTick = B / (Σ 1/p_i)
            // We implement this in integer arithmetic by scaling the reciprocal
            // terms with `pricePrecision ** 2` so that we avoid fractional
            // values while maintaining precision.

            // ------------------------------------------
            // 1. Compute the scaled reciprocal sum Σ pricePrecision^2 / p_i
            // ------------------------------------------
            const reciprocalSumScaled = asks.reduce(
                (sum, ask) => sum + this.mulDivUp(pricePrecision, pricePrecision, ask.price),
                BigInt(0),
            );

            if (reciprocalSumScaled === BigInt(0)) {
                throw new Error('reciprocalSumScaled is zero – check price inputs');
            }

            // ------------------------------------------
            // 2. Compute ask liquidity in sizePrecision units
            //    Formula: L_i = (B * sizePrecision * pricePrecision^2) /
            //                     (ΣRecipScaled * p_i * 10^{baseDecimals})
            // ------------------------------------------
            for (const ask of asks) {
                ask.liquidity =
                    (baseLiquidity * sizePrecision * pricePrecision * pricePrecision) /
                    (reciprocalSumScaled * ask.price * BigInt(10) ** baseAssetDecimals);

                if (ask.liquidity < minSize) {
                    throw new Error('ask liquidity is less than minSize');
                }
            }

            // ------------------------------------------
            // 3. Derive the constant quotePerTick from the first ask bucket.
            //    quotePerTick = L_1 * p_1 * 10^{quoteDecimals} / (sizePrecision * pricePrecision)
            // ------------------------------------------
            const firstAsk = asks[0];
            const quotePerTick =
                (firstAsk.liquidity * firstAsk.price * BigInt(10) ** quoteAssetDecimals) /
                (sizePrecision * pricePrecision);

            // ------------------------------------------
            // 4. Allocate liquidity for bids (inverse conversion)
            //    L_bid = quotePerTick * sizePrecision * pricePrecision /
            //            (p_bid * 10^{quoteDecimals})
            // ------------------------------------------
            let inferredQuoteLiquidity: bigint = BigInt(0);

            for (const bid of bids) {
                bid.liquidity = this.normalizeBidSize(
                    bid.price,
                    sizePrecision,
                    (quotePerTick * sizePrecision * pricePrecision) / (bid.price * BigInt(10) ** quoteAssetDecimals),
                );

                inferredQuoteLiquidity += quotePerTick; // one quotePerTick per bid

                if (bid.liquidity < minSize) {
                    throw new Error('bid liquidity is less than minSize');
                }
            }

            return {
                bids: bids.sort((a, b) => Number(b.price - a.price)),
                asks: asks.sort((a, b) => Number(b.price - a.price)),
                quoteLiquidity: inferredQuoteLiquidity,
                baseLiquidity: baseLiquidity,
            };
        }

        if (baseLiquidity !== undefined && quoteLiquidity !== undefined) {
            for (const ask of asks) {
                ask.liquidity = (baseLiquidity * sizePrecision) / (numAsks * BigInt(10) ** baseAssetDecimals);
                if (ask.liquidity < minSize) {
                    throw new Error('ask liquidity is less than minSize');
                }
            }

            for (const bid of bids) {
                bid.liquidity = this.normalizeBidSize(
                    bid.price,
                    sizePrecision,
                    (quoteLiquidity * sizePrecision * pricePrecision) /
                        (numBids * bid.price * BigInt(10) ** quoteAssetDecimals),
                );
                if (bid.liquidity < minSize) {
                    throw new Error('bid liquidity is less than minSize');
                }
            }

            return {
                bids: bids.sort((a, b) => Number(b.price - a.price)),
                asks: asks.sort((a, b) => Number(b.price - a.price)),
                quoteLiquidity: quoteLiquidity ?? BigInt(0),
                baseLiquidity: baseLiquidity ?? BigInt(0),
            };
        }

        return {
            bids: [],
            asks: [],
            quoteLiquidity: BigInt(0),
            baseLiquidity: BigInt(0),
        };
    }

    /**
     * Calculates the liquidity distribution for a batch of limit orders on a "Curve" or "U-shape".
     * The core principle is that quote currency value is lowest at the outer edges of the
     * price range and increases in an arithmetic progression towards the center (bestAskPrice).
     *
     * @param minFeesBps - Minimum fees in basis points.
     * @param startPrice - The starting price for placing liquidity (farthest bid).
     * @param endPrice - The ending price for placing liquidity (farthest ask).
     * @param bestAskPrice - The current best ask price on the market, which is the center of the curve.
     * @param pricePrecision - The precision factor for prices (e.g., 10^18).
     * @param sizePrecision - The precision factor for position sizes (e.g., 10^6).
     * @param quoteAssetDecimals - The number of decimals for the quote asset.
     * @param baseAssetDecimals - The number of decimals for the base asset.
     * @param tickSize - The minimum price increment.
     * @param minSize - The minimum position size allowed.
     * @param quoteLiquidity - The total liquidity for one side of the curve, denominated in the quote asset.
     * @param baseLiquidity - The total liquidity for the asks side of the curve, denominated in the base asset.
     * @param maxPricePoints - The maximum number of price points to prevent infinite loop.
     * @returns A promise resolving to an object with bid and ask positions and total liquidity.
     */
    static async getCurveBatchLPDetails(
        minFeesBps: bigint,
        startPrice: bigint,
        endPrice: bigint,
        bestAskPrice: bigint,
        pricePrecision: bigint,
        sizePrecision: bigint,
        quoteAssetDecimals: bigint,
        baseAssetDecimals: bigint,
        tickSize: bigint,
        minSize: bigint,
        quoteLiquidity?: bigint, // In quote asset decimals
        baseLiquidity?: bigint, // In base asset decimals
        maxPricePoints?: number, // max number price points to prevent infinite loop
    ): Promise<BatchLPDetails> {
        if (maxPricePoints !== undefined) {
            // Enforce that startPrice * (1 + minFeesBps/FEE_DENOMINATOR)^maxPricePoints < endPrice
            // This is equivalent to: startPrice * (FEE_DENOMINATOR + minFeesBps)^maxPricePoints < endPrice * FEE_DENOMINATOR^maxPricePoints

            let maxReachablePrice = startPrice;
            let feeDenominatorPower = BigInt(1);
            let feeNumeratorPower = BigInt(1);

            // Calculate (FEE_DENOMINATOR + minFeesBps)^maxPricePoints and FEE_DENOMINATOR^maxPricePoints
            for (let i = 0; i < maxPricePoints; i++) {
                feeNumeratorPower *= FEE_DENOMINATOR + minFeesBps;
                feeDenominatorPower *= FEE_DENOMINATOR;
            }

            maxReachablePrice = (startPrice * feeNumeratorPower) / feeDenominatorPower;

            if (maxReachablePrice <= endPrice) {
                throw new Error(
                    `maxPricePoints constraint violated: maximum reachable price (${maxReachablePrice}) would exceed or equal endPrice (${endPrice})`,
                );
            }
        }

        if (quoteLiquidity === undefined && baseLiquidity === undefined) {
            throw new Error('Either quoteLiquidity or baseLiquidity must be provided.');
        }

        startPrice = startPrice - (startPrice % tickSize);

        const bids: Position[] = [];
        const asks: Position[] = [];
        let currentPrice = startPrice;

        const maxPrice = Math.min(Number(bestAskPrice), Number(endPrice));

        // #############################################################
        // # 1. Generate Bid & Ask Position Grids
        // #############################################################
        while (currentPrice < maxPrice) {
            let nextPrice = (currentPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
            if (nextPrice === currentPrice) nextPrice = currentPrice + tickSize;
            nextPrice = nextPrice - (nextPrice % tickSize);

            var flipPrice = (nextPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
            if (flipPrice == nextPrice) {
                flipPrice = nextPrice + tickSize;
            }
            flipPrice = flipPrice - (flipPrice % tickSize);

            bids.push({ price: currentPrice, liquidity: BigInt(0), flipPrice });
            currentPrice = nextPrice;
        }

        while (currentPrice < endPrice) {
            let nextPrice = (currentPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
            if (nextPrice === currentPrice) nextPrice = currentPrice + tickSize;
            nextPrice = nextPrice - (nextPrice % tickSize);

            // Prevent asks from exceeding endPrice
            if (nextPrice > endPrice) {
                break;
            }

            var flipPrice = (startPrice * (FEE_DENOMINATOR - minFeesBps)) / FEE_DENOMINATOR;
            if (flipPrice == startPrice) {
                flipPrice = startPrice - tickSize;
            }
            flipPrice = flipPrice - (flipPrice % tickSize);

            asks.push({ price: nextPrice, liquidity: BigInt(0), flipPrice });
            currentPrice = nextPrice;
        }

        const numBids = BigInt(bids.length);
        const numAsks = BigInt(asks.length);

        // #############################################################
        // # 2. Distribute Liquidity
        // #############################################################

        if (quoteLiquidity !== undefined) {
            // Scenario A: Total Quote Liquidity is provided.
            const quoteUnitForBids =
                numBids > 0 ? (BigInt(2) * quoteLiquidity) / (numBids * (numBids + BigInt(1))) : BigInt(0);
            const quoteUnitForAsks =
                numAsks > 0 ? (BigInt(2) * quoteLiquidity) / (numAsks * (numAsks + BigInt(1))) : BigInt(0);
            let totalBaseLiquidity = BigInt(0);

            // Distribute across bids: liquidity increases towards the center.
            for (let i = 0; i < bids.length; i++) {
                const bid = bids[i];
                // Farthest bid (i=0) gets 1 unit; closest bid (i=numBids-1) gets numBids units.
                const quoteMultiplier = BigInt(i + 1);
                const quoteForThisBid = quoteUnitForBids * quoteMultiplier;
                bid.liquidity = this.normalizeBidSize(
                    bid.price,
                    sizePrecision,
                    (quoteForThisBid * pricePrecision * sizePrecision) / (BigInt(10) ** quoteAssetDecimals * bid.price),
                );
                if (bid.liquidity < minSize) throw new Error('Calculated bid liquidity is less than minSize.');
            }

            // Distribute across asks: liquidity increases towards the center.
            if (numAsks > 0) {
                for (let i = 0; i < asks.length; i++) {
                    const ask = asks[i];
                    // CORRECTED: Closest ask (i=0) gets numAsks units; farthest ask (i=numAsks-1) gets 1 unit.
                    const quoteMultiplier = numAsks - BigInt(i);
                    const quoteForThisAsk = quoteUnitForAsks * quoteMultiplier;
                    ask.liquidity =
                        (quoteForThisAsk * sizePrecision * pricePrecision) /
                        (BigInt(10) ** quoteAssetDecimals * ask.price);

                    // Accumulate the resulting base liquidity from asks.
                    totalBaseLiquidity +=
                        (quoteForThisAsk * BigInt(10) ** baseAssetDecimals * pricePrecision) /
                        (BigInt(10) ** quoteAssetDecimals * ask.price);

                    if (ask.liquidity < minSize) throw new Error('Calculated ask liquidity is less than minSize.');
                }
            } else {
                totalBaseLiquidity = BigInt(0);
            }

            baseLiquidity = totalBaseLiquidity;
        } else if (baseLiquidity !== undefined) {
            // Scenario B: Total Base Liquidity is provided (for asks).
            if (numAsks === BigInt(0)) {
                throw new Error('Cannot provide baseLiquidity when there are no asks to place it in.');
            }

            // CORRECTED INVARIANT: quote_i = (numAsks - i) * quote_unit for asks
            // quote_unit corresponds to the farthest ask (q_f = b_f * p_f)
            // base_i * price_i = (numAsks - i) * b_f * p_f => base_i = (numAsks - i) * b_f * (p_f / p_i)
            // Total Base B = b_f * sum((numAsks - i) * (p_f / p_i))
            const farthestAsk = asks[asks.length - 1];
            const farthestAskPrice = farthestAsk.price;
            let weightedSumOfBaseRatios = BigInt(0);

            for (let i = 0; i < asks.length; i++) {
                const ask = asks[i];
                // Multiplier is (numAsks - i)
                const ratio = this.mulDivUp((numAsks - BigInt(i)) * farthestAskPrice, pricePrecision, ask.price);
                weightedSumOfBaseRatios += ratio;
            }

            // Solve for b_f (base liquidity in the FARTHEST ask).
            const baseInFarthestAsk =
                weightedSumOfBaseRatios > 0 ? (baseLiquidity * pricePrecision) / weightedSumOfBaseRatios : BigInt(0);

            let totalQuoteLiquidity = BigInt(0);

            // Distribute liquidity across all asks based on b_f.
            for (let i = 0; i < asks.length; i++) {
                const ask = asks[i];
                const baseForThisAsk = ((numAsks - BigInt(i)) * baseInFarthestAsk * farthestAskPrice) / ask.price;
                ask.liquidity = (baseForThisAsk * sizePrecision) / BigInt(10) ** baseAssetDecimals;

                if (ask.liquidity < minSize) throw new Error('Calculated ask liquidity is less than minSize.');

                const quoteForThisAsk =
                    (baseForThisAsk * ask.price * BigInt(10) ** quoteAssetDecimals) /
                    (BigInt(10) ** baseAssetDecimals * pricePrecision);
                totalQuoteLiquidity += quoteForThisAsk;
            }

            // Now use the total quote from asks to provision bids with the same curve shape.
            if (numBids > 0) {
                const quoteUnitForBids = (BigInt(2) * totalQuoteLiquidity) / (numBids * (numBids + BigInt(1)));
                for (let i = 0; i < bids.length; i++) {
                    const bid = bids[i];
                    // Farthest bid (i=0) gets 1 unit, closest gets numBids units.
                    const quoteMultiplier = BigInt(i + 1);
                    const quoteForThisBid = quoteUnitForBids * quoteMultiplier;
                    bid.liquidity = this.normalizeBidSize(
                        bid.price,
                        sizePrecision,
                        (quoteForThisBid * pricePrecision * sizePrecision) /
                            (BigInt(10) ** quoteAssetDecimals * bid.price),
                    );
                    if (bid.liquidity < minSize) throw new Error('Calculated bid liquidity is less than minSize.');
                }
            } else {
                totalQuoteLiquidity = BigInt(0);
            }

            quoteLiquidity = totalQuoteLiquidity;
        }

        // #############################################################
        // # 3. Finalize and Return
        // #############################################################
        return {
            bids: bids.sort((a, b) => Number(b.price - a.price)), // highest price first
            asks: asks.sort((a, b) => Number(a.price - b.price)), // lowest price first
            quoteLiquidity: quoteLiquidity ?? BigInt(0),
            baseLiquidity: baseLiquidity ?? BigInt(0),
        };
    }

    /**
     * Calculates the liquidity distribution for a batch of limit orders in a "bid-ask" or "triangular" shape.
     * The core principle is that quote liquidity is lowest at the center (best bid/ask) and increases
     * linearly as prices move away from the spread.
     *
     * @param minFeesBps - Minimum fees in basis points.
     * @param startPrice - The starting price for placing liquidity (farthest bid).
     * @param endPrice - The ending price for placing liquidity (farthest ask).
     * @param bestAskPrice - The current best ask price, which defines the center of the spread.
     * @param pricePrecision - The precision factor for prices (e.g., 10^18).
     * @param sizePrecision - The precision factor for position sizes (e.g., 10^6).
     * @param quoteAssetDecimals - The number of decimals for the quote asset.
     * @param baseAssetDecimals - The number of decimals for the base asset.
     * @param tickSize - The minimum price increment.
     * @param minSize - The minimum position size allowed.
     * @param quoteLiquidity - The total liquidity for one side (e.g., asks), denominated in the quote asset.
     * @param baseLiquidity - The total liquidity for one side (e.g., asks), denominated in the base asset.
     * @param maxPricePoints - The maximum number of price points to prevent infinite loop.
     * @returns A promise resolving to an object with bid and ask positions and total liquidity.
     */
    static async getBidAskBatchLPDetails(
        minFeesBps: bigint,
        startPrice: bigint,
        endPrice: bigint,
        bestAskPrice: bigint,
        pricePrecision: bigint,
        sizePrecision: bigint,
        quoteAssetDecimals: bigint,
        baseAssetDecimals: bigint,
        tickSize: bigint,
        minSize: bigint,
        quoteLiquidity?: bigint, // In quote asset decimals
        baseLiquidity?: bigint, // In base asset decimals
        maxPricePoints?: number, // max number price points to prevent infinite loop
    ): Promise<BatchLPDetails> {
        if (maxPricePoints !== undefined) {
            // Enforce that startPrice * (1 + minFeesBps/FEE_DENOMINATOR)^maxPricePoints < endPrice
            // This is equivalent to: startPrice * (FEE_DENOMINATOR + minFeesBps)^maxPricePoints < endPrice * FEE_DENOMINATOR^maxPricePoints

            let maxReachablePrice = startPrice;
            let feeDenominatorPower = BigInt(1);
            let feeNumeratorPower = BigInt(1);

            // Calculate (FEE_DENOMINATOR + minFeesBps)^maxPricePoints and FEE_DENOMINATOR^maxPricePoints
            for (let i = 0; i < maxPricePoints; i++) {
                feeNumeratorPower *= FEE_DENOMINATOR + minFeesBps;
                feeDenominatorPower *= FEE_DENOMINATOR;
            }

            maxReachablePrice = (startPrice * feeNumeratorPower) / feeDenominatorPower;

            if (maxReachablePrice <= endPrice) {
                throw new Error(
                    `maxPricePoints constraint violated: maximum reachable price (${maxReachablePrice}) would exceed or equal endPrice (${endPrice})`,
                );
            }
        }

        // Ensure that at least one form of liquidity is provided.
        if (quoteLiquidity === undefined && baseLiquidity === undefined) {
            throw new Error('Either quoteLiquidity or baseLiquidity must be provided.');
        }

        // Align the starting price with the nearest tick.
        startPrice = startPrice - (startPrice % tickSize);

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
            if (nextPrice === currentPrice) nextPrice = currentPrice + tickSize;
            nextPrice = nextPrice - (nextPrice % tickSize);

            var flipPrice = (nextPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
            if (flipPrice == nextPrice) {
                flipPrice = nextPrice + tickSize;
            }
            flipPrice = flipPrice - (flipPrice % tickSize);

            bids.push({ price: currentPrice, liquidity: BigInt(0), flipPrice });
            currentPrice = nextPrice;
        }

        // Asks are created from the center outwards to the farthest price (endPrice).
        while (currentPrice < endPrice) {
            let nextPrice = (currentPrice * (FEE_DENOMINATOR + minFeesBps)) / FEE_DENOMINATOR;
            if (nextPrice === currentPrice) nextPrice = currentPrice + tickSize;
            nextPrice = nextPrice - (nextPrice % tickSize);

            // Prevent asks from exceeding endPrice
            if (nextPrice > endPrice) {
                break;
            }

            var flipPrice = (startPrice * (FEE_DENOMINATOR - minFeesBps)) / FEE_DENOMINATOR;
            if (flipPrice == startPrice) {
                flipPrice = startPrice - tickSize;
            }
            flipPrice = flipPrice - (flipPrice % tickSize);

            asks.push({ price: nextPrice, liquidity: BigInt(0), flipPrice });
            currentPrice = nextPrice;
        }

        const numBids = BigInt(bids.length);
        const numAsks = BigInt(asks.length);

        // #############################################################
        // # 2. Distribute Liquidity
        // #############################################################

        if (quoteLiquidity !== undefined) {
            // Scenario A: Total Quote Liquidity is provided.
            // It's assumed this quote amount is for EACH side of the book.

            let totalBaseLiquidity = BigInt(0);

            // The sum of an arithmetic series 1 + 2 + ... + N is N*(N+1)/2.
            // This is the total number of "quote units" to be distributed.
            // We use it to find the value of a single unit (the amount for the closest position).
            const quoteUnitForBids =
                numBids > 0 ? (BigInt(2) * quoteLiquidity) / (numBids * (numBids + BigInt(1))) : BigInt(0);
            const quoteUnitForAsks =
                numAsks > 0 ? (BigInt(2) * quoteLiquidity) / (numAsks * (numAsks + BigInt(1))) : BigInt(0);

            // Distribute liquidity across bids.
            for (let i = 0; i < bids.length; i++) {
                const bid = bids[i];
                // bids[0] is the farthest, bids[numBids-1] is the closest.
                // The closest bid gets 1 unit, the next gets 2, ..., the farthest gets numBids units.
                const quoteMultiplier = numBids - BigInt(i);
                const quoteForThisBid = quoteUnitForBids * quoteMultiplier;

                bid.liquidity = this.normalizeBidSize(
                    bid.price,
                    sizePrecision,
                    (quoteForThisBid * pricePrecision * sizePrecision) / (BigInt(10) ** quoteAssetDecimals * bid.price),
                );
                if (bid.liquidity < minSize) throw new Error('Calculated bid liquidity is less than minSize.');
            }

            if (numAsks > 0) {
                // Distribute liquidity across asks.
                for (let i = 0; i < asks.length; i++) {
                    const ask = asks[i];
                    // asks[0] is the closest, asks[numAsks-1] is the farthest.
                    // The closest ask gets 1 unit, the next gets 2, etc.
                    const quoteMultiplier = BigInt(i + 1);
                    const quoteForThisAsk = quoteUnitForAsks * quoteMultiplier;

                    ask.liquidity =
                        (quoteForThisAsk * pricePrecision * sizePrecision) /
                        (BigInt(10) ** quoteAssetDecimals * ask.price);
                    if (ask.liquidity < minSize) throw new Error('Calculated ask liquidity is less than minSize.');

                    // We only need to calculate the resulting base liquidity from one side (asks).
                    totalBaseLiquidity +=
                        (quoteForThisAsk * BigInt(10) ** baseAssetDecimals * pricePrecision) /
                        (BigInt(10) ** quoteAssetDecimals * ask.price);
                }
            } else {
                totalBaseLiquidity = BigInt(0);
            }

            baseLiquidity = totalBaseLiquidity;
        } else if (baseLiquidity !== undefined) {
            // Scenario B: Total Base Liquidity is provided (assumed for the asks).
            // This is the corrected logic.
            if (numAsks === BigInt(0)) {
                throw new Error('Cannot provide baseLiquidity when there are no asks to place it in.');
            }

            // The invariant: quote_i = i * quote_1 (where i=1 is the closest ask)
            // This means: (base_i * price_i) = i * (base_1 * price_1)
            // So, base_i = i * base_1 * (price_1 / price_i)
            // Total Base Liquidity (B) = sum(base_i) = base_1 * sum(i * (price_1 / price_i))
            // We first calculate the weighted sum: sum(i * (price_1 / price_i))

            const closestAskPrice = asks[0].price;
            let weightedSumOfBaseRatios = BigInt(0);

            for (let i = 0; i < asks.length; i++) {
                const ask = asks[i];
                // Calculate term `i * (price_1 / price_i)`. Multiply by pricePrecision for integer math.
                const ratio = BigInt(i + 1) * this.mulDivUp(closestAskPrice, pricePrecision, ask.price);
                weightedSumOfBaseRatios += ratio;
            }

            // Solve for base_1: base_1 = B / (weightedSum / pricePrecision)
            // base_1 (in base asset decimals) = (B * pricePrecision) / weightedSum
            const baseInClosestAsk = (baseLiquidity * pricePrecision) / weightedSumOfBaseRatios;

            let totalQuoteLiquidity = BigInt(0);

            // Distribute liquidity across all asks based on base_1.
            for (let i = 0; i < asks.length; i++) {
                const ask = asks[i];
                // Calculate base_i = base_1 * i * (price_1 / price_i)
                const baseForThisAsk = (baseInClosestAsk * BigInt(i + 1) * closestAskPrice) / ask.price;

                ask.liquidity = (baseForThisAsk * sizePrecision) / BigInt(10) ** baseAssetDecimals;
                if (ask.liquidity < minSize) throw new Error('Calculated ask liquidity is less than minSize.');

                // Calculate the corresponding quote amount and add to the total.
                const quoteForThisAsk =
                    (baseForThisAsk * ask.price * BigInt(10) ** quoteAssetDecimals) /
                    (BigInt(10) ** baseAssetDecimals * pricePrecision);
                totalQuoteLiquidity += quoteForThisAsk;
            }

            // Now, use the total quote liquidity from the asks to provision the bids.
            if (numBids > 0) {
                // The total quote in the bids should mirror the total quote in the asks.
                const quoteUnitForBids = (BigInt(2) * totalQuoteLiquidity) / (numBids * (numBids + BigInt(1)));
                for (let i = 0; i < bids.length; i++) {
                    const bid = bids[i];
                    // Farthest bid gets most liquidity, closest gets the least.
                    const quoteMultiplier = numBids - BigInt(i);
                    const quoteForThisBid = quoteUnitForBids * quoteMultiplier;

                    bid.liquidity = this.normalizeBidSize(
                        bid.price,
                        sizePrecision,
                        (quoteForThisBid * pricePrecision * sizePrecision) /
                            (BigInt(10) ** quoteAssetDecimals * bid.price),
                    );
                    if (bid.liquidity < minSize) throw new Error('Calculated bid liquidity is less than minSize.');
                }
            } else {
                totalQuoteLiquidity = BigInt(0);
            }

            quoteLiquidity = totalQuoteLiquidity;
        }

        // #############################################################
        // # 3. Finalize and Return
        // #############################################################
        // Sort bids descending (highest price first) and asks ascending (lowest price first).
        return {
            bids: bids.sort((a, b) => Number(b.price - a.price)),
            asks: asks.sort((a, b) => Number(a.price - b.price)),
            quoteLiquidity: quoteLiquidity ?? BigInt(0),
            baseLiquidity: baseLiquidity ?? BigInt(0),
        };
    }

    static normalizeBidSize(price: bigint, sizePrecision: bigint, bidSize: bigint): bigint {
        if (this.mulDivUp(price, bidSize, sizePrecision) > (price * bidSize) / sizePrecision) {
            return bidSize - this.mulDivUp(BigInt(1), sizePrecision, price);
        }

        return bidSize;
    }

    /**
     * Performs multiplication followed by division with ceiling (rounding up).
     * Equivalent to the Solidity mulDivUp function with overflow protection.
     * @param x First multiplicand
     * @param y Second multiplicand
     * @param d Denominator
     * @returns Result of (x * y) / d rounded up
     */
    static mulDivUp(x: bigint, y: bigint, d: bigint): bigint {
        // Check for zero denominator
        if (d === BigInt(0)) {
            throw new Error('MulDivFailed: denominator is zero');
        }

        const z = x * y;

        // Overflow check: equivalent to `require(d != 0 && (y == 0 || x <= type(uint256).max / y))`
        // In JavaScript/TypeScript with BigInt, we need to check if the division gives us back the original value
        if (y !== BigInt(0) && z / y !== x) {
            throw new Error('MulDivFailed: multiplication overflow');
        }

        // Ceiling division: add 1 if there's a remainder
        const remainder = z % d;
        const quotient = z / d;

        // If remainder is not zero, round up by adding 1
        return remainder === BigInt(0) ? quotient : quotient + BigInt(1);
    }
}
