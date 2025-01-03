// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import {
  OrderBookData,
  WssOrderEvent,
  WssCanceledOrderEvent,
  MarketParams,
  VaultParams,
  WssTradeEvent,
} from "../types";
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
    providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
    orderbookAddress: string,
    marketParams: MarketParams,
    l2Book?: any,
    contractVaultParams?: any
  ): Promise<OrderBookData> {
    const orderbook = new ethers.Contract(
      orderbookAddress,
      orderbookAbi.abi,
      providerOrSigner
    );

    let data = l2Book;
    if (!data) {
      data = await orderbook.getL2Book({ from: ethers.ZeroAddress });
    }

    let offset = 66; // Start reading after the block number
    const blockNumber = parseInt(data.slice(2, 66), 16); // The block number is stored in the first 64 bytes after '0x'

    let manualBids: number[][] = [];
    let manualAsks: number[][] = [];

    // Decode bids
    while (offset < data.length) {
      const price = BigInt("0x" + data.slice(offset, offset + 64));
      offset += 64; // Skip over padding
      if (price === BigInt(0)) {
        break; // Stop reading if price is zero
      }
      const size = BigInt("0x" + data.slice(offset, offset + 64));
      offset += 64; // Skip over padding
      manualBids.push([
        parseFloat(
          ethers.formatUnits(
            price,
            log10BigNumber(marketParams.pricePrecision)
          )
        ),
        parseFloat(
          ethers.formatUnits(
            size,
            log10BigNumber(marketParams.sizePrecision)
          )
        ),
      ]);
    }

    // Decode asks
    while (offset < data.length) {
      const price = BigInt("0x" + data.slice(offset, offset + 64));
      offset += 64; // Skip over padding
      if (price === BigInt(0)) {
        break; // Stop reading if price is zero
      }
      const size = BigInt("0x" + data.slice(offset, offset + 64));
      offset += 64; // Skip over padding
      manualAsks.push([
        parseFloat(
          ethers.formatUnits(
            price,
            log10BigNumber(marketParams.pricePrecision)
          )
        ),
        parseFloat(
          ethers.formatUnits(
            size,
            log10BigNumber(marketParams.sizePrecision)
          )
        ),
      ]);
    }

    // Get AMM Prices
    const { ammPrices, vaultParams } = await getAmmPrices(
      providerOrSigner,
      orderbookAddress,
      marketParams,
      blockNumber,
      contractVaultParams
    );

    // Combine manual orders and AMM prices
    const combinedBids = combinePrices(manualBids, ammPrices.bids);
    const combinedAsks = combinePrices(manualAsks, ammPrices.asks);

    // Sort bids and asks
    combinedBids.sort((a, b) => b[0] - a[0]);
    combinedAsks.sort((a, b) => b[0] - a[0]);

    return {
      bids: combinedBids,
      asks: combinedAsks,
      blockNumber,
      manualOrders: {
        bids: manualBids,
        asks: manualAsks,
      },
      vaultParams,
    };
  }

  static reconcileOrderCreated(
    existingOrderBook: OrderBookData,
    marketParams: MarketParams,
    orderEvent: WssOrderEvent
  ): OrderBookData {
    // Create deep copies to prevent mutations
    const newOrderBook: OrderBookData = {
      ...existingOrderBook,
      manualOrders: {
        bids: [...existingOrderBook.manualOrders.bids],
        asks: [...existingOrderBook.manualOrders.asks],
      },
    };

    // Convert size and price to floating-point numbers
    const orderSize = parseFloat(
      ethers.formatUnits(
        orderEvent.size,
        log10BigNumber(marketParams.sizePrecision)
      )
    );
    const orderPrice = parseFloat(
      ethers.formatUnits(
        orderEvent.price,
        log10BigNumber(marketParams.pricePrecision)
      )
    );

    // Determine which side of the book to update
    const sideToUpdate = orderEvent.isBuy
      ? newOrderBook.manualOrders.bids
      : newOrderBook.manualOrders.asks;

    // Find if there's an existing order at this price
    const existingOrderIndex = sideToUpdate.findIndex(
      ([price, _]) => price === orderPrice
    );

    if (existingOrderIndex !== -1) {
      // If an order at this price exists, update its size
      sideToUpdate[existingOrderIndex][1] += orderSize;
    } else {
      // If no order at this price exists, add a new order
      sideToUpdate.push([orderPrice, orderSize]);

      // Re-sort the manual orders
      if (orderEvent.isBuy) {
        newOrderBook.manualOrders.bids.sort((a, b) => b[0] - a[0]); // Descending
      } else {
        newOrderBook.manualOrders.asks.sort((a, b) => a[0] - b[0]); // Ascending
      }
    }

    // Recombine manual orders with AMM prices
    const ammPrices = getAmmPricesFromVaultParams(
      newOrderBook.vaultParams,
      marketParams
    );

    const combinedBids = combinePrices(
      newOrderBook.manualOrders.bids,
      ammPrices.bids
    );
    const combinedAsks = combinePrices(
      newOrderBook.manualOrders.asks,
      ammPrices.asks
    );

    // Sort combined orders
    combinedBids.sort((a, b) => b[0] - a[0]);
    combinedAsks.sort((a, b) => b[0] - a[0]);

    // Update bids and asks
    newOrderBook.bids = combinedBids;
    newOrderBook.asks = combinedAsks;

    // Update the block number
    newOrderBook.blockNumber = Number(orderEvent.blockNumber);

    return newOrderBook;
  }

  static reconcileCanceledOrders(
    existingOrderBook: OrderBookData,
    marketParams: MarketParams,
    canceledOrderEvent: WssCanceledOrderEvent
  ): OrderBookData {
    // Create deep copies to prevent mutations
    const newOrderBook: OrderBookData = {
      ...existingOrderBook,
      manualOrders: {
        bids: [...existingOrderBook.manualOrders.bids],
        asks: [...existingOrderBook.manualOrders.asks],
      },
    };

    for (const canceledOrder of canceledOrderEvent.canceledOrdersData) {
      // Convert size and price to floating-point numbers
      const orderSize = parseFloat(
        ethers.formatUnits(
          canceledOrder.size,
          log10BigNumber(marketParams.sizePrecision)
        )
      );
      const orderPrice = parseFloat(
        ethers.formatUnits(
          canceledOrder.price,
          log10BigNumber(marketParams.pricePrecision)
        )
      );

      // Determine which side of the book to update
      const sideToUpdate = canceledOrder.isbuy
        ? newOrderBook.manualOrders.bids
        : newOrderBook.manualOrders.asks;

      // Find the existing order at this price
      const existingOrderIndex = sideToUpdate.findIndex(
        ([price, _]) => price === orderPrice
      );

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

    // Recombine manual orders with AMM prices
    const ammPrices = getAmmPricesFromVaultParams(
      newOrderBook.vaultParams,
      marketParams
    );

    const combinedBids = combinePrices(
      newOrderBook.manualOrders.bids,
      ammPrices.bids
    );
    const combinedAsks = combinePrices(
      newOrderBook.manualOrders.asks,
      ammPrices.asks
    );

    // Sort combined orders
    combinedBids.sort((a, b) => b[0] - a[0]);
    combinedAsks.sort((a, b) => b[0] - a[0]);

    // Update bids and asks
    newOrderBook.bids = combinedBids;
    newOrderBook.asks = combinedAsks;

    // Update the block number
    newOrderBook.blockNumber = parseInt(
      canceledOrderEvent.canceledOrdersData[0].blocknumber,
      16
    );

    return newOrderBook;
  }

  static reconcileTradeEvent(
    existingOrderBook: OrderBookData,
    marketParams: MarketParams,
    tradeEvent: WssTradeEvent
  ): OrderBookData {
    // Create deep copies to prevent mutations
    const newOrderBook: OrderBookData = {
      ...existingOrderBook,
      vaultParams: { ...existingOrderBook.vaultParams },
      manualOrders: {
        bids: [...existingOrderBook.manualOrders.bids],
        asks: [...existingOrderBook.manualOrders.asks],
      },
    };
  
    const tradePrice = parseFloat(
      ethers.formatUnits(
        tradeEvent.price,
        18
      )
    );
  
    if (tradeEvent.orderId === 0) {
      // Trade involves AMM order
      const spreadConstant = newOrderBook.vaultParams.spread / BigInt(10);
  
      const updatedSizeBN = BigInt(tradeEvent.updatedSize);
  
      if (tradeEvent.isBuy) {
        // Trader is buying, AMM is selling (ask side)
  
        if (updatedSizeBN === BigInt(0)) {
          // Move to next price level and create new orders
          newOrderBook.vaultParams.vaultBestAsk = mulDivRound(
            newOrderBook.vaultParams.vaultBestAsk,
            BigInt(1000) + spreadConstant,
            BigInt(1000)
          );
  
          // Update bid price based on new ask price
          newOrderBook.vaultParams.vaultBestBid = mulDivRound(
            newOrderBook.vaultParams.vaultBestAsk,
            BigInt(1000),
            BigInt(1000) + spreadConstant
          );
  
          // Update order sizes
          newOrderBook.vaultParams.vaultAskOrderSize = mulDivRound(
            newOrderBook.vaultParams.vaultAskOrderSize,
            BigInt(2000),
            BigInt(2000) + spreadConstant
          );
          newOrderBook.vaultParams.vaultBidOrderSize = mulDivRound(
            newOrderBook.vaultParams.vaultAskOrderSize,
            BigInt(2000) + spreadConstant,
            BigInt(2000)
          );
  
          // Reset partially filled sizes for new price level
          newOrderBook.vaultParams.askPartiallyFilledSize = BigInt(0);
          newOrderBook.vaultParams.bidPartiallyFilledSize = mulDivRound(
            newOrderBook.vaultParams.bidPartiallyFilledSize,
            BigInt(1000),
            BigInt(1000) + spreadConstant
          );
        } else {
          // Update partially filled size for current price level
          newOrderBook.vaultParams.askPartiallyFilledSize = 
            newOrderBook.vaultParams.vaultAskOrderSize - updatedSizeBN;
        }
      } else {
        // Trader is selling, AMM is buying (bid side)
  
        if (updatedSizeBN === BigInt(0)) {
          // Move to next price level and create new orders
          newOrderBook.vaultParams.vaultBestBid = mulDivRound(
            newOrderBook.vaultParams.vaultBestBid,
            BigInt(1000),
            BigInt(1000) + spreadConstant
          );
  
          // Update ask price based on new bid price
          newOrderBook.vaultParams.vaultBestAsk = mulDivRound(
            newOrderBook.vaultParams.vaultBestBid,
            BigInt(1000) + spreadConstant,
            BigInt(1000)
          );
  
          // Update order sizes
          newOrderBook.vaultParams.vaultBidOrderSize = mulDivRound(
            newOrderBook.vaultParams.vaultBidOrderSize,
            BigInt(2000) + spreadConstant,
            BigInt(2000)
          );
          newOrderBook.vaultParams.vaultAskOrderSize = mulDivRound(
            newOrderBook.vaultParams.vaultBidOrderSize,
            BigInt(2000),
            BigInt(2000) + spreadConstant
          );
  
          // Reset partially filled sizes for new price level
          newOrderBook.vaultParams.bidPartiallyFilledSize = BigInt(0);
        } else {
          // Update partially filled size for current price level
          newOrderBook.vaultParams.bidPartiallyFilledSize = 
            newOrderBook.vaultParams.vaultBidOrderSize - updatedSizeBN;
        }
      }
  
      // After updating the vault parameters, recalculate the AMM prices
      const ammPrices = getAmmPricesFromVaultParams(
        newOrderBook.vaultParams,
        marketParams
      );
  
      // Recombine manual orders with updated AMM prices
      const combinedBids = combinePrices(
        newOrderBook.manualOrders.bids,
        ammPrices.bids
      );
      const combinedAsks = combinePrices(
        newOrderBook.manualOrders.asks,
        ammPrices.asks
      );
  
      // Sort combined orders
      combinedBids.sort((a, b) => b[0] - a[0]);
      combinedAsks.sort((a, b) => b[0] - a[0]);
  
      // Update bids and asks
      newOrderBook.bids = combinedBids;
      newOrderBook.asks = combinedAsks;
    } else {
      // Trade involves manual order
      // Convert filled size to float for manual orders
      const filledSize = parseFloat(
        ethers.formatUnits(
          tradeEvent.filledSize,
          log10BigNumber(marketParams.sizePrecision)
        )
      );
  
      // Determine which side of the book to update
      const sideToUpdate = tradeEvent.isBuy
        ? newOrderBook.manualOrders.asks
        : newOrderBook.manualOrders.bids;
  
      // Find the existing order at this price
      const existingOrderIndex = sideToUpdate.findIndex(
        ([price, _]) => price === tradePrice
      );
  
      if (existingOrderIndex !== -1) {
        // If an order at this price exists, reduce its size
        sideToUpdate[existingOrderIndex][1] -= filledSize;
  
        // If the size becomes zero or negative, remove the order
        if (sideToUpdate[existingOrderIndex][1] <= 0) {
          sideToUpdate.splice(existingOrderIndex, 1);
        }
      }
      // If the order doesn't exist in our book, we don't need to do anything
  
      // Recombine manual orders with AMM prices
      const ammPrices = getAmmPricesFromVaultParams(
        newOrderBook.vaultParams,
        marketParams
      );
  
      const combinedBids = combinePrices(
        newOrderBook.manualOrders.bids,
        ammPrices.bids
      );
      const combinedAsks = combinePrices(
        newOrderBook.manualOrders.asks,
        ammPrices.asks
      );
  
      // Sort combined orders
      combinedBids.sort((a, b) => b[0] - a[0]);
      combinedAsks.sort((a, b) => b[0] - a[0]);
  
      // Update bids and asks
      newOrderBook.bids = combinedBids;
      newOrderBook.asks = combinedAsks;
    }
  
    // Update the block number
    newOrderBook.blockNumber = parseInt(tradeEvent.blockNumber, 10);
  
    return newOrderBook;
  }

  static async getFormattedL2OrderBook(
    providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
    orderbookAddress: string,
    marketParams: MarketParams,
    l2Book?: any,
    contractVaultParams?: any
  ): Promise<OrderBookData> {
    // First get the regular order book
    const orderBook = await OrderBook.getL2OrderBook(
      providerOrSigner,
      orderbookAddress,
      marketParams,
      l2Book,
      contractVaultParams
    );

    // Calculate decimals based on pricePrecision and tickSize
    const pricePrecisionDecimals = log10BigNumber(marketParams.pricePrecision);
    const tickSizeDecimals = log10BigNumber(marketParams.tickSize);
    const decimals = pricePrecisionDecimals - tickSizeDecimals;

    // Helper functions to format price according to precision
    const formatAskPrice = (price: number): number => {
      const multiplier = Math.pow(10, decimals);
      return Math.ceil(price * multiplier) / multiplier;
    };

    const formatBidPrice = (price: number): number => {
      const multiplier = Math.pow(10, decimals);
      return Math.floor(price * multiplier) / multiplier;
    };

    // Helper function to group orders by price and sum sizes
    const groupOrders = (orders: number[][], roundingFn: (price: number) => number): number[][] => {
      const priceMap = new Map<number, number>();
      
      orders.forEach(([price, size]) => {
        const roundedPrice = roundingFn(price);
        priceMap.set(roundedPrice, (priceMap.get(roundedPrice) || 0) + size);
      });

      return Array.from(priceMap.entries())
        .map(([price, size]) => [price, size]);
    };

    // Format and group bids (round down)
    const formattedBids = groupOrders(orderBook.bids, formatBidPrice)
      .sort((a, b) => b[0] - a[0]);

    // Format and group asks (round up)
    const formattedAsks = groupOrders(orderBook.asks, formatAskPrice)
      .sort((a, b) => b[0] - a[0]);

    // Format and group manual orders
    const formattedManualBids = groupOrders(orderBook.manualOrders.bids, formatBidPrice)
      .sort((a, b) => b[0] - a[0]);

    const formattedManualAsks = groupOrders(orderBook.manualOrders.asks, formatAskPrice)
      .sort((a, b) => b[0] - a[0]);

    return {
      ...orderBook,
      bids: formattedBids,
      asks: formattedAsks,
      manualOrders: {
        bids: formattedManualBids,
        asks: formattedManualAsks
      }
    };
  }

  static reconcileFormattedTradeEvent(
    existingOrderBook: OrderBookData,
    marketParams: MarketParams,
    tradeEvent: WssTradeEvent
  ): OrderBookData {
    // Create deep copies to prevent mutations
    const newOrderBook: OrderBookData = {
      ...existingOrderBook,
      vaultParams: { ...existingOrderBook.vaultParams },
      manualOrders: {
        bids: [...existingOrderBook.manualOrders.bids],
        asks: [...existingOrderBook.manualOrders.asks],
      },
    };

    // Calculate decimals for price formatting
    const pricePrecisionDecimals = log10BigNumber(marketParams.pricePrecision);
    const tickSizeDecimals = log10BigNumber(marketParams.tickSize);
    const decimals = pricePrecisionDecimals - tickSizeDecimals;

    // Helper functions for price formatting
    const formatPrice = (price: number, isAsk: boolean): number => {
      const multiplier = Math.pow(10, decimals);
      return isAsk 
        ? Math.ceil(price * multiplier) / multiplier   // Round up for asks
        : Math.floor(price * multiplier) / multiplier; // Round down for bids
    };

    if (tradeEvent.orderId === 0) {
      // Handle AMM trade
      const spreadConstant = newOrderBook.vaultParams.spread / BigInt(10);
      const updatedSizeBN = BigInt(tradeEvent.updatedSize);

      if (tradeEvent.isBuy) {
        // AMM is selling (ask side)
        if (updatedSizeBN === BigInt(0)) {
          // Move to next price level and create new orders
          newOrderBook.vaultParams.vaultBestAsk = mulDivRound(
            newOrderBook.vaultParams.vaultBestAsk,
            BigInt(1000) + spreadConstant,
            BigInt(1000)
          );

          // Update bid price based on new ask price
          newOrderBook.vaultParams.vaultBestBid = mulDivRound(
            newOrderBook.vaultParams.vaultBestAsk,
            BigInt(1000),
            BigInt(1000) + spreadConstant
          );

          // Update order sizes
          newOrderBook.vaultParams.vaultAskOrderSize = mulDivRound(
            newOrderBook.vaultParams.vaultAskOrderSize,
            BigInt(2000),
            BigInt(2000) + spreadConstant
          );
          newOrderBook.vaultParams.vaultBidOrderSize = mulDivRound(
            newOrderBook.vaultParams.vaultAskOrderSize,
            BigInt(2000) + spreadConstant,
            BigInt(2000)
          );

          // Reset partially filled sizes for new price level
          newOrderBook.vaultParams.askPartiallyFilledSize = BigInt(0);
          newOrderBook.vaultParams.bidPartiallyFilledSize = mulDivRound(
            newOrderBook.vaultParams.bidPartiallyFilledSize,
            BigInt(1000),
            BigInt(1000) + spreadConstant
          );
        } else {
          // Update partially filled size for current price level
          newOrderBook.vaultParams.askPartiallyFilledSize = 
            newOrderBook.vaultParams.vaultAskOrderSize - updatedSizeBN;
        }
      } else {
        // AMM is buying (bid side)
        if (updatedSizeBN === BigInt(0)) {
          // Move to next price level and create new orders
          newOrderBook.vaultParams.vaultBestBid = mulDivRound(
            newOrderBook.vaultParams.vaultBestBid,
            BigInt(1000),
            BigInt(1000) + spreadConstant
          );

          // Update ask price based on new bid price
          newOrderBook.vaultParams.vaultBestAsk = mulDivRound(
            newOrderBook.vaultParams.vaultBestBid,
            BigInt(1000) + spreadConstant,
            BigInt(1000)
          );

          // Update order sizes
          newOrderBook.vaultParams.vaultBidOrderSize = mulDivRound(
            newOrderBook.vaultParams.vaultBidOrderSize,
            BigInt(2000) + spreadConstant,
            BigInt(2000)
          );
          newOrderBook.vaultParams.vaultAskOrderSize = mulDivRound(
            newOrderBook.vaultParams.vaultBidOrderSize,
            BigInt(2000),
            BigInt(2000) + spreadConstant
          );

          // Reset partially filled sizes for new price level
          newOrderBook.vaultParams.bidPartiallyFilledSize = BigInt(0);
        } else {
          // Update partially filled size for current price level
          newOrderBook.vaultParams.bidPartiallyFilledSize = 
            newOrderBook.vaultParams.vaultBidOrderSize - updatedSizeBN;
        }
      }

      // Recalculate AMM prices with updated vault params
      const ammPrices = getAmmPricesFromVaultParams(newOrderBook.vaultParams, marketParams);

      // Group and format orders
      const groupAndFormatOrders = (orders: number[][], isAsk: boolean): number[][] => {
        const priceMap = new Map<number, number>();
        
        orders.forEach(([price, size]) => {
          const formattedPrice = formatPrice(price, isAsk);
          priceMap.set(formattedPrice, (priceMap.get(formattedPrice) || 0) + size);
        });

        return Array.from(priceMap.entries())
          .filter(([_, size]) => size > 0)
          .sort((a, b) => b[0] - a[0]);
      };

      // Update order book with formatted orders
      newOrderBook.bids = groupAndFormatOrders([...newOrderBook.manualOrders.bids, ...ammPrices.bids], false);
      newOrderBook.asks = groupAndFormatOrders([...newOrderBook.manualOrders.asks, ...ammPrices.asks], true);
      newOrderBook.manualOrders.bids = groupAndFormatOrders(newOrderBook.manualOrders.bids, false);
      newOrderBook.manualOrders.asks = groupAndFormatOrders(newOrderBook.manualOrders.asks, true);

    } else {
      // Handle manual order trade
      const filledSize = parseFloat(
        ethers.formatUnits(
          tradeEvent.filledSize,
          log10BigNumber(marketParams.sizePrecision)
        )
      );

      // Convert trade price to formatted number
      const rawTradePrice = parseFloat(ethers.formatUnits(tradeEvent.price, 18));
      const formattedTradePrice = formatPrice(rawTradePrice, tradeEvent.isBuy);

      // Update the appropriate side of the book
      const sideToUpdate = tradeEvent.isBuy
        ? newOrderBook.manualOrders.asks  // If buyer, reduce ask side
        : newOrderBook.manualOrders.bids; // If seller, reduce bid side

      const existingOrderIndex = sideToUpdate.findIndex(
        ([price]) => Math.abs(price - formattedTradePrice) < Number.EPSILON
      );

      if (existingOrderIndex !== -1) {
        sideToUpdate[existingOrderIndex][1] -= filledSize;
        if (sideToUpdate[existingOrderIndex][1] <= 0) {
          sideToUpdate.splice(existingOrderIndex, 1);
        }
      }

      // Group and format orders
      const groupAndFormatOrders = (orders: number[][], isAsk: boolean): number[][] => {
        const priceMap = new Map<number, number>();
        
        orders.forEach(([price, size]) => {
          const formattedPrice = formatPrice(price, isAsk);
          priceMap.set(formattedPrice, (priceMap.get(formattedPrice) || 0) + size);
        });

        return Array.from(priceMap.entries())
          .filter(([_, size]) => size > 0)
          .sort((a, b) => b[0] - a[0]);
      };
      // Recombine manual orders with AMM prices
      const ammPrices = getAmmPricesFromVaultParams(newOrderBook.vaultParams, marketParams);

      // Update order book with formatted orders
      newOrderBook.bids = groupAndFormatOrders([...newOrderBook.manualOrders.bids, ...ammPrices.bids], false);
      newOrderBook.asks = groupAndFormatOrders([...newOrderBook.manualOrders.asks, ...ammPrices.asks], true);
      newOrderBook.manualOrders.bids = groupAndFormatOrders(newOrderBook.manualOrders.bids, false);
      newOrderBook.manualOrders.asks = groupAndFormatOrders(newOrderBook.manualOrders.asks, true);
    }

    // Update block number
    newOrderBook.blockNumber = parseInt(tradeEvent.blockNumber, 10);

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
  providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
  orderbookAddress: string,
  marketParams: MarketParams,
  blockNumber: number,
  contractVaultParams: any
): Promise<{
  ammPrices: { bids: number[][]; asks: number[][] };
  vaultParams: VaultParams;
}> {
  const orderbook = new ethers.Contract(
    orderbookAddress,
    orderbookAbi.abi,
    providerOrSigner
  );

  let vaultParamsData = contractVaultParams;

  if (!vaultParamsData) {
    vaultParamsData = await orderbook.getVaultParams.staticCallResult({from: ethers.ZeroAddress, blockTag: blockNumber});
  }

  const vaultParams: VaultParams = {
    kuruAmmVault: vaultParamsData[0],
    vaultBestBid: BigInt(vaultParamsData[1]),
    bidPartiallyFilledSize: BigInt(vaultParamsData[2]),
    vaultBestAsk: BigInt(vaultParamsData[3]),
    askPartiallyFilledSize: BigInt(vaultParamsData[4]),
    vaultBidOrderSize: BigInt(vaultParamsData[5]),
    vaultAskOrderSize: BigInt(vaultParamsData[6]),
    spread: BigInt(vaultParamsData[7]),
  };

  const ammPrices = getAmmPricesFromVaultParams(vaultParams, marketParams);

  return { ammPrices, vaultParams };
}

/**
 * @dev Recalculates the AMM prices based on updated vault parameters.
 * @param vaultParams - The updated vault parameters.
 * @param marketParams - The market parameters including price and size precision.
 * @returns The recalculated AMM prices.
 */
function getAmmPricesFromVaultParams(
  vaultParams: VaultParams,
  marketParams: MarketParams
): { bids: number[][]; asks: number[][] } {
  let {
    vaultBestAsk,
    vaultBestBid,
    vaultBidOrderSize,
    vaultAskOrderSize,
    bidPartiallyFilledSize,
    askPartiallyFilledSize,
    spread,
  } = vaultParams;

  let bids: number[][] = [];
  let asks: number[][] = [];

  if (
    vaultBidOrderSize === BigInt(0) ||
    vaultParams.kuruAmmVault === ethers.ZeroAddress
  ) {
    return { bids, asks };
  }

  const spreadConstant = spread / BigInt(10);

  // Calculate remaining sizes at current price levels
  const firstBidOrderSize = vaultBidOrderSize - bidPartiallyFilledSize;
  const firstAskOrderSize = vaultAskOrderSize - askPartiallyFilledSize;

  let currentBidPrice = vaultBestBid;
  let currentAskPrice = vaultBestAsk;
  let currentBidSize = vaultBidOrderSize;
  let currentAskSize = vaultAskOrderSize;

  // Add vault bid orders to AMM prices
  for (let i = 0; i < 300; i++) {
    if (currentBidPrice === BigInt(0)) break;

    const size = i === 0 ? firstBidOrderSize : currentBidSize;

    bids.push([
      parseFloat(ethers.formatUnits(currentBidPrice, 18)),
      parseFloat(
        ethers.formatUnits(
          size,
          log10BigNumber(marketParams.sizePrecision)
        )
      ),
    ]);

    // Next bid price = currentPrice * 1000 / (1000 + spreadConstant)
    currentBidPrice = mulDivRound(
      currentBidPrice,
      BigInt(1000),
      BigInt(1000) + spreadConstant
    );

    // Next bid size = currentSize * (2000 + spreadConstant) / 2000
    currentBidSize = mulDivRound(
      currentBidSize,
      BigInt(2000) + spreadConstant,
      BigInt(2000)
    );
  }

  // Add vault ask orders to AMM prices
  for (let i = 0; i < 300; i++) {
    if (currentAskPrice >= ethers.MaxUint256) break;

    const size = i === 0 ? firstAskOrderSize : currentAskSize;

    asks.push([
      parseFloat(ethers.formatUnits(currentAskPrice, 18)),
      parseFloat(
        ethers.formatUnits(
          size,
          log10BigNumber(marketParams.sizePrecision)
        )
      ),
    ]);

    // Next ask price = currentPrice * (1000 + spreadConstant) / 1000
    currentAskPrice = mulDivRound(
      currentAskPrice,
      BigInt(1000) + spreadConstant,
      BigInt(1000)
    );

    // Next ask size = currentSize * 2000 / (2000 + spreadConstant)
    currentAskSize = mulDivRound(
      currentAskSize,
      BigInt(2000),
      BigInt(2000) + spreadConstant
    );
  }

  return { bids, asks };
}

/**
 * @dev Combines two price arrays, summing sizes for duplicate prices.
 * @param originalPrices - The original prices array.
 * @param additionalPrices - The additional prices array to merge.
 * @returns The combined prices array.
 */
function combinePrices(
  originalPrices: number[][],
  additionalPrices: number[][]
): number[][] {
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
