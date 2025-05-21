import { ethers } from 'ethers';
import { PoolFetcher } from '../../src/pools/fetcher';
import { BaseToken } from '../../src/types/pool';

const kuruApi = 'https://api.staging.kuru.io:3001';

// Get command line arguments
const args = process.argv.slice(2);
const tokenInAddress = args[0];
const tokenOutAddress = args[1];

// Define custom base tokens
const customBaseTokens: BaseToken[] = [
    { symbol: 'ETH', address: ethers.constants.AddressZero },
    { symbol: 'USDC', address: '0xb73472fF5a4799F7182CB8f60360de6Ec7BB9c94' },
];

(async () => {
    const poolFetcher = new PoolFetcher(kuruApi);

    try {
        // Get all pools with custom base tokens
        const pools = await poolFetcher.getAllPools(tokenInAddress, tokenOutAddress, customBaseTokens);

        console.log('Found pools:');
        pools.forEach((pool, index) => {
            console.log(`\nPool ${index + 1}:`);
            console.log(`Base Token: ${pool.baseToken}`);
            console.log(`Quote Token: ${pool.quoteToken}`);
            console.log(`Orderbook: ${pool.orderbook}`);
        });
    } catch (error) {
        console.error('Error finding pools:', error);
    }
})();
