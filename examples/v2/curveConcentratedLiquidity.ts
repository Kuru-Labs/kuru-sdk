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

        const orderbook = await KuruSdk.OrderBook.getL2OrderBook(provider, contractAddress, marketParams);

        console.log('bestAskPrice', orderbook.asks[orderbook.asks.length - 1][0]);
        // Extract best ask price from orderbook
        const bestAskPrice =
            orderbook.asks.length > 0
                ? BigInt(Math.floor(orderbook.asks[orderbook.asks.length - 1][0] * 1000000000))
                : BigInt(0);

        // Define price range for concentrated liquidity
        const minFeesPps = BigInt(10000); // 1% fee (10000 pps = 100 bps)
        const startPrice = bestAskPrice - (bestAskPrice * BigInt(10)) / BigInt(100); // 1% below best ask
        const endPrice = bestAskPrice + (bestAskPrice * BigInt(10)) / BigInt(100); // 1% above best ask

        // Get concentrated liquidity positions with curve distribution
        console.time('getCurveBatchLPDetails');
        const batchLPDetails = await KuruSdk.PositionViewer.getCurveBatchLPDetails(
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
            BigInt(1) * BigInt(10) ** BigInt(marketParams.quoteAssetDecimals.toString()),
        );
        console.timeEnd('getCurveBatchLPDetails');

        // Display results
        console.log('Curve Concentrated Liquidity Positions:');
        console.log('\nBid Positions (Linear increase in liquidity towards best bid):');
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

        console.log('\nAsk Positions (Linear decrease in liquidity from best ask):');
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

        // const privateKey = process.env.PRIVATE_KEY as string;
        // const signer = new ethers.Wallet(privateKey, provider);
        // const receipt = await KuruSdk.PositionProvider.provisionLiquidity(
        //     signer,
        //     contractAddress,
        //     batchLPDetails
        // );

        // console.log("Transaction hash:", receipt.transactionHash);
    } catch (error) {
        console.error('Error retrieving curve concentrated liquidity positions:', error);
    }
})();
