import axios from 'axios';

import * as KuruConfig from '../config.json';

interface OrderBookResponse {
    success: boolean;
    code: number;
    timestamp: number;
    data: {
        asks: [number, number][];
        bids: [number, number][];
    };
}

const { contractAddress } = KuruConfig;

class OrderbookWatcher {
    private lastOrderbookJson: string | null = null;
    private apiUrl: string;

    constructor(contractAddress: string) {
        this.apiUrl = `https://api.kuru.io/api/v2/orders/market/${contractAddress}/l2book`;
    }

    public startWatching(intervalMs: number = 500): void {
        setInterval(async () => {
            try {
                const response = await axios.get<OrderBookResponse>(this.apiUrl);
                const currentOrderbook = response.data;
                const currentOrderbookJson = JSON.stringify(currentOrderbook, null, 4);

                if (this.lastOrderbookJson !== currentOrderbookJson) {
                    const asksArray = currentOrderbook.data.asks
                        .map(([price, quantity]) => ({ price, quantity }))
                        .sort((a, b) => a.price - b.price) // Sort asks ascending
                        .slice(0, 10);

                    const bidsArray = currentOrderbook.data.bids
                        .map(([price, quantity]) => ({ price, quantity }))
                        .sort((a, b) => b.price - a.price) // Sort bids descending
                        .slice(0, 10);

                    const maxBaseSize = Math.max(
                        ...asksArray.map((a) => a.quantity),
                        ...bidsArray.map((b) => b.quantity),
                    );
                    const maxBaseSizeLength = maxBaseSize.toString().length;

                    const printLine = (price: number, size: number, color: 'red' | 'green') => {
                        const priceStr = price.toString().padStart(10, ' ');
                        const sizeStr = size.toString().padStart(maxBaseSizeLength, ' ');
                        console.log(priceStr + ' ' + `\u001b[3${color === 'green' ? 2 : 1}m` + sizeStr + '\u001b[0m');
                    };

                    console.clear();
                    console.log('=================================');
                    console.log('Asks');
                    console.log('=================================');
                    for (let i = asksArray.length - 1; i >= 0; i--) {
                        const { price, quantity } = asksArray[i];
                        if (quantity !== 0) {
                            printLine(price, quantity, 'red');
                        }
                    }

                    console.log('=================================');
                    console.log('Bids');
                    console.log('=================================');
                    bidsArray.forEach(({ price, quantity }) => {
                        if (quantity !== 0) {
                            printLine(price, quantity, 'green');
                        }
                    });

                    this.lastOrderbookJson = currentOrderbookJson;
                }
            } catch (error) {
                console.error('Failed to fetch or process L2 Orderbook:', error);
            }
        }, intervalMs);
    }
}

(async () => {
    const watcher = new OrderbookWatcher(contractAddress);
    watcher.startWatching(); // Default polling interval set to 500 milliseconds
})();
