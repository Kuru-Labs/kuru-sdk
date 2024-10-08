// ============ External Imports ============
import { ethers, BigNumber } from "ethers";

// ============ Internal Imports ============
import { OrderBookData, WssOrderEvent, WssCanceledOrderEvent, MarketParams, VaultParams, WssTradeEvent } from "../types";
import { log10BigNumber, mulDivRound } from "../utils";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";

export abstract class OrderBook {
    /**
     * @dev Retrieves the Level 2 order book data from the order book contract.
     * @param providerOrSigner - The ethers.js provider to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param marketParams - The market parameters including price and size precision.
     * @returns A promise that resolves to the order book data.
     */
    static async getL2OrderBook(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        marketParams: MarketParams,
        l2Book?: any,
        contractVaultParams?: any
    ): Promise<OrderBookData> {
        const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi.abi, providerOrSigner);

        let data = l2Book;
        if (!data) {
            data = await orderbook.getL2Book();
        }

        let offset = 66; // Start reading after the block number
        const blockNumber = parseInt(data.slice(2, 66), 16); // The block number is stored in the first 64 bytes after '0x'

        let bids: number[][] = [];
        let asks: number[][] = [];

        // Decode bids
        while (offset < data.length) {
            const price = parseInt(data.slice(offset, offset + 64), 16);
            offset += 64; // Skip over padding
            if (price === 0) {
                break; // Stop reading if price is zero
            }
            const size = parseInt(data.slice(offset, offset + 64), 16);
            offset += 64; // Skip over padding
            bids.push([
                parseFloat(ethers.utils.formatUnits(price, log10BigNumber(marketParams.pricePrecision))),
                parseFloat(ethers.utils.formatUnits(size, log10BigNumber(marketParams.sizePrecision)))
            ]);
        }

        // Decode asks
        while (offset < data.length) {
            const price = parseInt(data.slice(offset, offset + 64), 16);
            offset += 64; // Skip over padding
            if (price === 0) {
                break; // Stop reading if price is zero
            }
            const size = parseInt(data.slice(offset, offset + 64), 16);
            offset += 64; // Skip over padding
            asks.push([
                parseFloat(ethers.utils.formatUnits(price, log10BigNumber(marketParams.pricePrecision))),
                parseFloat(ethers.utils.formatUnits(size, log10BigNumber(marketParams.sizePrecision)))
            ]);
        }

        // Get AMM Prices
        const ammPrices = await getAmmPrices(providerOrSigner, orderbookAddress, marketParams, blockNumber, contractVaultParams);

        // Combine AMM Prices with Order Book Prices
        const combinedBids = combinePrices(bids, ammPrices.bids);
        const combinedAsks = combinePrices(asks, ammPrices.asks);

        // Sort bids and asks in decreasing order of price
        combinedBids.sort((a, b) => b[0] - a[0]);
        combinedAsks.sort((a, b) => b[0] - a[0]);

        return { bids: combinedBids, asks: combinedAsks, blockNumber };
    }

    static reconcileOrderCreated(
        existingOrderBook: OrderBookData,
        marketParams: MarketParams,
        orderEvent: WssOrderEvent
    ): OrderBookData {
        // Convert size and price to floating-point numbers
        const orderSize = parseFloat(
            ethers.utils.formatUnits(orderEvent.size, log10BigNumber(marketParams.sizePrecision))
        );
        const orderPrice = parseFloat(
            ethers.utils.formatUnits(orderEvent.price, log10BigNumber(marketParams.pricePrecision))
        );
    
        // Create a deep copy of the existing orderbook
        const newOrderBook: OrderBookData = JSON.parse(JSON.stringify(existingOrderBook));
    
        // Determine which side of the book to update
        const sideToUpdate = orderEvent.isBuy ? newOrderBook.bids : newOrderBook.asks;
    
        // Find if there's an existing order at this price
        const existingOrderIndex = sideToUpdate.findIndex(([price, _]) => price === orderPrice);
    
        if (existingOrderIndex !== -1) {
            // If an order at this price exists, update its size
            sideToUpdate[existingOrderIndex][1] += orderSize;
        } else {
            // If no order at this price exists, add a new order
            sideToUpdate.push([orderPrice, orderSize]);
    
            // Re-sort the order book
            if (orderEvent.isBuy) {
                newOrderBook.bids.sort((a, b) => b[0] - a[0]); // Sort bids in descending order
            } else {
                newOrderBook.asks.sort((a, b) => a[0] - b[0]); // Sort asks in ascending order
            }
        }
    
        // Update the block number
        newOrderBook.blockNumber = orderEvent.blockNumber.toNumber();
    
        return newOrderBook;
    }

    static reconcileCanceledOrders(
        existingOrderBook: OrderBookData,
        marketParams: MarketParams,
        canceledOrderEvent: WssCanceledOrderEvent
    ): OrderBookData {
        // Create a deep copy of the existing orderbook
        const newOrderBook: OrderBookData = JSON.parse(JSON.stringify(existingOrderBook));
    
        for (const canceledOrder of canceledOrderEvent.canceledOrdersData) {
            // Convert size and price to floating-point numbers
            const orderSize = parseFloat(
                ethers.utils.formatUnits(canceledOrder.size, log10BigNumber(marketParams.sizePrecision))
            );
            const orderPrice = parseFloat(
                ethers.utils.formatUnits(canceledOrder.price, log10BigNumber(marketParams.pricePrecision))
            );
    
            // Determine which side of the book to update
            const sideToUpdate = canceledOrder.isbuy ? newOrderBook.bids : newOrderBook.asks;
    
            // Find the existing order at this price
            const existingOrderIndex = sideToUpdate.findIndex(([price, _]) => price === orderPrice);
    
            if (existingOrderIndex !== -1) {
                // If an order at this price exists, reduce its size
                sideToUpdate[existingOrderIndex][1] -= orderSize;
    
                // If the size becomes zero or negative, remove the order
                if (sideToUpdate[existingOrderIndex][1] <= 0) {
                    sideToUpdate.splice(existingOrderIndex, 1);
                }
            }
            // If the order doesn't exist in our book, we don't need to do anything
        }
    
        // Update the block number
        newOrderBook.blockNumber = parseInt(canceledOrderEvent.canceledOrdersData[0].blocknumber, 16);
    
        return newOrderBook;
    }

    static reconcileTradeEvent(
        existingOrderBook: OrderBookData,
        marketParams: MarketParams,
        tradeEvent: WssTradeEvent
    ): OrderBookData {
        // Create a deep copy of the existing orderbook
        const newOrderBook: OrderBookData = JSON.parse(JSON.stringify(existingOrderBook));
    
        // Convert price and size to floating-point numbers
        let tradePrice = parseFloat(
            ethers.utils.formatUnits(tradeEvent.price, 18) // price is in 10^18 precision
        );
        
        // Clip the price to pricePrecision decimal places
        const pricePrecisionDecimals = log10BigNumber(marketParams.pricePrecision);
        tradePrice = parseFloat(tradePrice.toFixed(pricePrecisionDecimals));
    
        const filledSize = parseFloat(
            ethers.utils.formatUnits(tradeEvent.filledSize, log10BigNumber(marketParams.sizePrecision))
        );
    
        // Determine which side of the book to update
        const sideToUpdate = tradeEvent.isBuy ? newOrderBook.asks : newOrderBook.bids;
    
        // Find the existing order at this price
        const existingOrderIndex = sideToUpdate.findIndex(([price, _]) => price === tradePrice);
    
        if (existingOrderIndex !== -1) {
            // If an order at this price exists, reduce its size
            sideToUpdate[existingOrderIndex][1] -= filledSize;
    
            // If the size becomes zero or negative, remove the order
            if (sideToUpdate[existingOrderIndex][1] <= 0) {
                sideToUpdate.splice(existingOrderIndex, 1);
            }
        }
        // If the order doesn't exist in our book, we don't need to do anything
    
        // Update the block number
        newOrderBook.blockNumber = parseInt(tradeEvent.blockNumber, 16);
    
        return newOrderBook;
    }
}

/**
 * @dev Retrieves only the AMM prices from the order book contract.
 * @param providerOrSigner - The ethers.js provider to interact with the blockchain.
 * @param orderbookAddress - The address of the order book contract.
 * @param marketParams - The market parameters including price and size precision.
 * @returns A promise that resolves to the AMM prices data.
 */
async function getAmmPrices(
    providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    orderbookAddress: string,
    marketParams: MarketParams,
    blockNumber: number,
    contractVaultParams: any
): Promise<{ bids: number[][], asks: number[][] }> {
    const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi.abi, providerOrSigner);

    let vaultParamsData = contractVaultParams;

    if (!vaultParamsData) {
        vaultParamsData = await providerOrSigner.call(
            {
                to: orderbookAddress,
                data: orderbook.interface.encodeFunctionData("getVaultParams")
            },
            blockNumber
        );

        vaultParamsData = orderbook.interface.decodeFunctionResult("getVaultParams", vaultParamsData);
    }

    const vaultParams: VaultParams = {
        kuruAmmVault: vaultParamsData[0],
        vaultBestBid: BigNumber.from(vaultParamsData[1]),
        bidPartiallyFilledSize: BigNumber.from(vaultParamsData[2]),
        vaultBestAsk: BigNumber.from(vaultParamsData[3]),
        askPartiallyFilledSize: BigNumber.from(vaultParamsData[4]),
        vaultBidOrderSize: BigNumber.from(vaultParamsData[5]),
        vaultAskOrderSize: BigNumber.from(vaultParamsData[6]),
        spread: BigNumber.from(vaultParamsData[7]),
    };

    let { vaultBestAsk, vaultBestBid, vaultBidOrderSize, vaultAskOrderSize, bidPartiallyFilledSize, askPartiallyFilledSize, spread } = vaultParams;

    let bids: number[][] = [];
    let asks: number[][] = [];

    let vaultBidOrderSizeAsFloat = parseFloat(ethers.utils.formatUnits(vaultBidOrderSize, log10BigNumber(marketParams.sizePrecision)));
    let vaultAskOrderSizeAsFloat = parseFloat(ethers.utils.formatUnits(vaultAskOrderSize, log10BigNumber(marketParams.sizePrecision)));
    const firstBidOrderSizeAsFloat = parseFloat(ethers.utils.formatUnits(vaultBidOrderSize.sub(bidPartiallyFilledSize), log10BigNumber(marketParams.sizePrecision)));
    const firstAskOrderSizeAsFloat = parseFloat(ethers.utils.formatUnits(vaultAskOrderSize.sub(askPartiallyFilledSize), log10BigNumber(marketParams.sizePrecision)));

    if (vaultBidOrderSize.isZero()) {
        return { bids, asks };
    }

    if (vaultParams.kuruAmmVault !== ethers.constants.AddressZero) {
        let spreadConstant = spread.div(BigNumber.from(10));
        // Add vault bid orders to AMM prices
        for (let i = 0; i < 30; i++) {
            if (vaultBestBid.isZero()) break;
            bids.push([
                parseFloat(ethers.utils.formatUnits(vaultBestBid, 18)),
                i === 0 ? firstBidOrderSizeAsFloat : vaultBidOrderSizeAsFloat
            ]);
            vaultBestBid = mulDivRound(vaultBestBid, BigNumber.from(1000), BigNumber.from(1000).add(spreadConstant));
            vaultBidOrderSize = mulDivRound(vaultBidOrderSize, BigNumber.from(2000).add(spreadConstant), BigNumber.from(2000));
            vaultBidOrderSizeAsFloat = parseFloat(ethers.utils.formatUnits(vaultBidOrderSize, log10BigNumber(marketParams.sizePrecision)));
        }

        // Add vault ask orders to AMM prices
        for (let i = 0; i < 30; i++) {
            if (vaultBestAsk.gte(ethers.constants.MaxUint256)) break;
            asks.push([
                parseFloat(ethers.utils.formatUnits(vaultBestAsk, 18)),
                i === 0 ? firstAskOrderSizeAsFloat : vaultAskOrderSizeAsFloat
            ]);
            vaultBestAsk = mulDivRound(vaultBestAsk, BigNumber.from(1000).add(spreadConstant), BigNumber.from(1000));
            vaultAskOrderSize = mulDivRound(vaultAskOrderSize, BigNumber.from(2000), BigNumber.from(2000).add(spreadConstant));
            vaultAskOrderSizeAsFloat = parseFloat(ethers.utils.formatUnits(vaultAskOrderSize, log10BigNumber(marketParams.sizePrecision)));
        }
    }

    return { bids, asks };
}

/**
 * @dev Combines two price arrays, summing sizes for duplicate prices.
 * @param originalPrices - The original prices array.
 * @param additionalPrices - The additional prices array to merge.
 * @returns The combined prices array.
 */
function combinePrices(originalPrices: number[][], additionalPrices: number[][]): number[][] {
    const priceMap = new Map<number, number>();

    // Add original prices to map
    originalPrices.forEach(([price, size]) => {
        priceMap.set(price, (priceMap.get(price) || 0) + size);
    });

    // Add additional prices to map
    additionalPrices.forEach(([price, size]) => {
        priceMap.set(price, (priceMap.get(price) || 0) + size);
    });

    // Convert map back to array
    return Array.from(priceMap.entries()).map(([price, size]) => [price, size]);
}
