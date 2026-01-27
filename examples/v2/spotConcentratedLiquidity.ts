import { ethers } from 'ethers';

import * as KuruSdk from '../../src';
import * as KuruConfig from '../config.json';

const { rpcUrl, contractAddress } = KuruConfig;

// Helper function to create ASCII bar graph
function createAsciiGraph(data: number[], maxBars: number = 50): string {
    const max = Math.max(...data);
    return data
        .map((value) => {
            const barLength = Math.round((value / max) * maxBars);

            return '█'.repeat(barLength) + ' '.repeat(maxBars - barLength) + ` (${value.toFixed(4)})`;
        })
        .join('\n');
}

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    try {
        // Get market parameters
        const marketParams = await KuruSdk.ParamFetcher.getMarketParams(provider, contractAddress);

        // Get current orderbook to determine best ask price
        // const orderbook = await KuruSdk.OrderBook.getL2OrderBook(provider, contractAddress, marketParams);

        // Extract best ask price from orderbook
        const bestAskPrice = BigInt(6941420);

        if (bestAskPrice === BigInt(0)) {
            throw new Error('Could not determine best ask price from orderbook');
        }

        // Define price range for concentrated liquidity
        const minFeesPps = BigInt(3000); // 0.3% fee (3000 pps = 30 bps)
        const startPrice = BigInt(6293270);
        const endPrice = BigInt(7791200);

        console.log(`
End Price:      ${ethers.utils.formatUnits(endPrice.toString(), KuruSdk.log10BigNumber(marketParams.pricePrecision))}
Best Ask Price: ${ethers.utils.formatUnits(bestAskPrice.toString(), KuruSdk.log10BigNumber(marketParams.pricePrecision))}
Start Price:    ${ethers.utils.formatUnits(startPrice.toString(), KuruSdk.log10BigNumber(marketParams.pricePrecision))}
`);

        // Get concentrated liquidity positions
        console.time('getSpotBatchLPDetails');
        const batchLPDetails = await KuruSdk.PositionViewer.getSpotBatchLPDetails(
            minFeesPps,
            startPrice,
            endPrice,
            bestAskPrice,
            BigInt(marketParams.pricePrecision.toString()),
            BigInt(marketParams.sizePrecision.toString()),
            BigInt(marketParams.quoteAssetDecimals.toString()),
            BigInt(marketParams.baseAssetDecimals.toString()),
            BigInt(marketParams.tickSize.toString()),
            BigInt(marketParams.minSize.toString()),
            undefined,
            BigInt(100) * BigInt(10) ** BigInt(marketParams.baseAssetDecimals.toString()),
        );
        console.timeEnd('getSpotBatchLPDetails');

        // Display results
        console.log('Concentrated Liquidity Positions:');
        console.log('\nBid Positions:');
        batchLPDetails.bids.forEach((position, index) => {
            console.log(`Position ${index + 1}:`);
            console.log(
                `  Price: ${ethers.utils.formatUnits(position.price.toString(), KuruSdk.log10BigNumber(marketParams.pricePrecision))}`,
            );
            console.log(
                `  Flip Price: ${ethers.utils.formatUnits(position.flipPrice.toString(), KuruSdk.log10BigNumber(marketParams.pricePrecision))}`,
            );
            console.log(
                `  Liquidity: ${ethers.utils.formatUnits(
                    position.liquidity.toString(),
                    KuruSdk.log10BigNumber(marketParams.sizePrecision),
                )}`,
            );
        });

        console.log('\nAsk Positions:');
        batchLPDetails.asks.forEach((position, index) => {
            console.log(`Position ${index + 1}:`);
            console.log(
                `  Price: ${ethers.utils.formatUnits(position.price.toString(), KuruSdk.log10BigNumber(marketParams.pricePrecision))}`,
            );
            console.log(
                `  Flip Price: ${ethers.utils.formatUnits(position.flipPrice.toString(), KuruSdk.log10BigNumber(marketParams.pricePrecision))}`,
            );
            console.log(
                `  Liquidity: ${ethers.utils.formatUnits(
                    position.liquidity.toString(),
                    KuruSdk.log10BigNumber(marketParams.sizePrecision),
                )}`,
            );
        });

        console.log(
            `\nQuote Liquidity: ${ethers.utils.formatUnits(batchLPDetails.quoteLiquidity.toString(), marketParams.quoteAssetDecimals)}`,
        );
        console.log(
            `Base Liquidity: ${ethers.utils.formatUnits(batchLPDetails.baseLiquidity.toString(), marketParams.baseAssetDecimals)}`,
        );

        // Add graphs at the end
        console.log('\nAsk Positions Graph (Size * Price):');
        const askValues = batchLPDetails.asks.map((position) => {
            const size = parseFloat(
                ethers.utils.formatUnits(
                    position.liquidity.toString(),
                    KuruSdk.log10BigNumber(marketParams.sizePrecision),
                ),
            );
            const price = parseFloat(
                ethers.utils.formatUnits(
                    position.price.toString(),
                    KuruSdk.log10BigNumber(marketParams.pricePrecision),
                ),
            );
            return size * price;
        });
        console.log(createAsciiGraph(askValues));

        console.log('\nBid Positions Graph (Size/Price):');
        const bidValues = batchLPDetails.bids.map((position) => {
            const size = parseFloat(
                ethers.utils.formatUnits(
                    position.liquidity.toString(),
                    KuruSdk.log10BigNumber(marketParams.sizePrecision),
                ),
            );
            const price = parseFloat(
                ethers.utils.formatUnits(
                    position.price.toString(),
                    KuruSdk.log10BigNumber(marketParams.pricePrecision),
                ),
            );
            return size * price;
        });
        console.log(createAsciiGraph(bidValues));
    } catch (error) {
        console.error('Error retrieving concentrated liquidity positions:', error);
    }
})();
