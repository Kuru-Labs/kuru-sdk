import { ethers } from 'ethers';
import * as KuruConfig from '../config.json';
import OrderBookABI from '../../abi/OrderBook.json';
import { getMinAndMaxPrice } from '../../src/concentratedLiquidity/lpSummary';

const { rpcUrl, contractAddress } = KuruConfig;

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    provider._pollingInterval = 100;

    try {
        const orderBook = new ethers.Contract(contractAddress, OrderBookABI.abi, provider);

        // Get market info
        const [bestBid, bestAsk] = await orderBook.bestBidAsk();
        const pricePrecision = 10 ** 8;
        const tickSize = 100;

        // Convert bestAsk to price precision
        const bestAskInPricePrecision = bestAsk.mul(BigInt(pricePrecision)).div(BigInt(10 ** 18));

        // Configuration for liquidity range
        const numPricePoints = 10; // Total number of orders (5 bids + 5 asks)
        const feeTierPps = BigInt(3000); // 0.30% fee tier (3000 pps = 30 bps)

        console.log('Market Info:');
        console.log('Best Bid:', bestBid.toString());
        console.log('Best Ask:', bestAsk.toString());
        console.log('Best Ask (Price Precision):', bestAskInPricePrecision.toString());
        console.log('Price Precision:', pricePrecision.toString());
        console.log('Tick Size:', tickSize.toString());
        console.log('\nLiquidity Configuration:');
        console.log('Number of Price Points:', numPricePoints);
        console.log('Fee Tier (pps):', feeTierPps.toString());

        // Calculate price range
        const { minPrice, maxPrice } = getMinAndMaxPrice(
            BigInt(bestAskInPricePrecision.toString()),
            BigInt(tickSize.toString()),
            numPricePoints,
            feeTierPps,
        );

        console.log('\nCalculated Price Range:');
        console.log('Min Price:', minPrice.toString());
        console.log('Max Price:', maxPrice.toString());

        // Human-readable prices
        const precision = Number(pricePrecision.toString());
        const minPriceReadable = Number(minPrice) / precision;
        const maxPriceReadable = Number(maxPrice) / precision;
        const bestAskReadable = Number(bestAsk) / 10 ** 18;

        console.log('\nHuman Readable:');
        console.log('Min Price:', minPriceReadable.toFixed(6));
        console.log('Best Ask:', bestAskReadable.toFixed(6));
        console.log('Max Price:', maxPriceReadable.toFixed(6));
        console.log(
            'Range Spread:',
            (((maxPriceReadable - minPriceReadable) / bestAskReadable) * 100).toFixed(2) + '%',
        );
    } catch (err: any) {
        console.error('Error:', err);
    }
})();
