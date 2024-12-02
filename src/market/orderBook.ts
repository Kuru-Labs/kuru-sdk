// ============ External Imports ============
import { ethers, BigNumber } from "ethers";

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
    providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
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
      data = await orderbook.getL2Book({ from: ethers.constants.AddressZero });
    }

    let offset = 66; // Start reading after the block number
    const blockNumber = parseInt(data.slice(2, 66), 16); // The block number is stored in the first 64 bytes after '0x'

    let manualBids: number[][] = [];
    let manualAsks: number[][] = [];

    // Decode bids
    while (offset < data.length) {
      const price = BigNumber.from("0x" + data.slice(offset, offset + 64));
      offset += 64; // Skip over padding
      if (price.isZero()) {
        break; // Stop reading if price is zero
      }
      const size = BigNumber.from("0x" + data.slice(offset, offset + 64));
      offset += 64; // Skip over padding
      manualBids.push([
        parseFloat(
          ethers.utils.formatUnits(
            price,
            log10BigNumber(marketParams.pricePrecision)
          )
        ),
        parseFloat(
          ethers.utils.formatUnits(
            size,
            log10BigNumber(marketParams.sizePrecision)
          )
        ),
      ]);
    }

    // Decode asks
    while (offset < data.length) {
      const price = BigNumber.from("0x" + data.slice(offset, offset + 64));
      offset += 64; // Skip over padding
      if (price.isZero()) {
        break; // Stop reading if price is zero
      }
      const size = BigNumber.from("0x" + data.slice(offset, offset + 64));
      offset += 64; // Skip over padding
      manualAsks.push([
        parseFloat(
          ethers.utils.formatUnits(
            price,
            log10BigNumber(marketParams.pricePrecision)
          )
        ),
        parseFloat(
          ethers.utils.formatUnits(
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
    combinedBids.sort((a, b) => b[0] - a[0]); // Descending for bids
    combinedAsks.sort((a, b) => a[0] - b[0]); // Ascending for asks

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
      ethers.utils.formatUnits(
        orderEvent.size,
        log10BigNumber(marketParams.sizePrecision)
      )
    );
    const orderPrice = parseFloat(
      ethers.utils.formatUnits(
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
    combinedBids.sort((a, b) => b[0] - a[0]); // Descending
    combinedAsks.sort((a, b) => a[0] - b[0]); // Ascending

    // Update bids and asks
    newOrderBook.bids = combinedBids;
    newOrderBook.asks = combinedAsks;

    // Update the block number
    newOrderBook.blockNumber = orderEvent.blockNumber.toNumber();

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
        ethers.utils.formatUnits(
          canceledOrder.size,
          log10BigNumber(marketParams.sizePrecision)
        )
      );
      const orderPrice = parseFloat(
        ethers.utils.formatUnits(
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
    combinedBids.sort((a, b) => b[0] - a[0]); // Descending
    combinedAsks.sort((a, b) => a[0] - b[0]); // Ascending

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
      ethers.utils.formatUnits(
        tradeEvent.price,
        18
      )
    );
  
    if (tradeEvent.orderId === 0) {
      // Trade involves AMM order
      const spreadConstant = newOrderBook.vaultParams.spread.div(
        BigNumber.from(10)
      );
  
      const updatedSizeBN = BigNumber.from(tradeEvent.updatedSize);
  
      if (tradeEvent.isBuy) {
        // Trader is buying, AMM is selling (ask side)
  
        if (updatedSizeBN.isZero()) {
          // Move to next price level
          newOrderBook.vaultParams.vaultBestAsk = mulDivRound(
            newOrderBook.vaultParams.vaultBestAsk,
            BigNumber.from(1000).add(spreadConstant),
            BigNumber.from(1000)
          );
  
          newOrderBook.vaultParams.vaultAskOrderSize = mulDivRound(
            newOrderBook.vaultParams.vaultAskOrderSize,
            BigNumber.from(2000),
            BigNumber.from(2000).add(spreadConstant)
          );
  
          // Reset askPartiallyFilledSize to zero for the new price level
          newOrderBook.vaultParams.askPartiallyFilledSize = BigNumber.from(0);
        } else {
          // Update askPartiallyFilledSize
          const filledSizeBN = newOrderBook.vaultParams.vaultAskOrderSize.sub(
            updatedSizeBN
          );
          newOrderBook.vaultParams.askPartiallyFilledSize = filledSizeBN;
        }
      } else {
        // Trader is selling, AMM is buying (bid side)
  
        if (updatedSizeBN.isZero()) {
          // Move to next price level
          newOrderBook.vaultParams.vaultBestBid = mulDivRound(
            newOrderBook.vaultParams.vaultBestBid,
            BigNumber.from(1000),
            BigNumber.from(1000).add(spreadConstant)
          );
  
          newOrderBook.vaultParams.vaultBidOrderSize = mulDivRound(
            newOrderBook.vaultParams.vaultBidOrderSize,
            BigNumber.from(2000).add(spreadConstant),
            BigNumber.from(2000)
          );
  
          // Reset bidPartiallyFilledSize to zero for the new price level
          newOrderBook.vaultParams.bidPartiallyFilledSize = BigNumber.from(0);
        } else {
          // Update bidPartiallyFilledSize
          const filledSizeBN = newOrderBook.vaultParams.vaultBidOrderSize.sub(
            updatedSizeBN
          );
          newOrderBook.vaultParams.bidPartiallyFilledSize = filledSizeBN;
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
      combinedBids.sort((a, b) => b[0] - a[0]); // Descending
      combinedAsks.sort((a, b) => a[0] - b[0]); // Ascending
  
      // Update bids and asks
      newOrderBook.bids = combinedBids;
      newOrderBook.asks = combinedAsks;
    } else {
      // Trade involves manual order
      // Convert filled size to float for manual orders
      const filledSize = parseFloat(
        ethers.utils.formatUnits(
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
      combinedBids.sort((a, b) => b[0] - a[0]); // Descending
      combinedAsks.sort((a, b) => a[0] - b[0]); // Ascending
  
      // Update bids and asks
      newOrderBook.bids = combinedBids;
      newOrderBook.asks = combinedAsks;
    }
  
    // Update the block number
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
  providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
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
    vaultParamsData = await providerOrSigner.call(
      {
        to: orderbookAddress,
        data: orderbook.interface.encodeFunctionData("getVaultParams"),
        from: ethers.constants.AddressZero,
      },
      blockNumber
    );

    vaultParamsData = orderbook.interface.decodeFunctionResult(
      "getVaultParams",
      vaultParamsData
    );
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
    vaultBidOrderSize.isZero() ||
    vaultParams.kuruAmmVault === ethers.constants.AddressZero
  ) {
    return { bids, asks };
  }

  const spreadConstant = spread.div(BigNumber.from(10));

  // Calculate remaining sizes at current price levels
  const firstBidOrderSize = vaultBidOrderSize.sub(bidPartiallyFilledSize);
  const firstAskOrderSize = vaultAskOrderSize.sub(askPartiallyFilledSize);

  let currentBidPrice = vaultBestBid;
  let currentAskPrice = vaultBestAsk;
  let currentBidSize = vaultBidOrderSize;
  let currentAskSize = vaultAskOrderSize;

  // Add vault bid orders to AMM prices
  for (let i = 0; i < 300; i++) {
    if (currentBidPrice.isZero()) break;

    const size = i === 0 ? firstBidOrderSize : currentBidSize;

    bids.push([
      parseFloat(ethers.utils.formatUnits(currentBidPrice, 18)),
      parseFloat(
        ethers.utils.formatUnits(
          size,
          log10BigNumber(marketParams.sizePrecision)
        )
      ),
    ]);

    // Next bid price = currentPrice * 1000 / (1000 + spreadConstant)
    currentBidPrice = mulDivRound(
      currentBidPrice,
      BigNumber.from(1000),
      BigNumber.from(1000).add(spreadConstant)
    );

    // Next bid size = currentSize * (2000 + spreadConstant) / 2000
    currentBidSize = mulDivRound(
      currentBidSize,
      BigNumber.from(2000).add(spreadConstant),
      BigNumber.from(2000)
    );
  }

  // Add vault ask orders to AMM prices
  for (let i = 0; i < 300; i++) {
    if (currentAskPrice.gte(ethers.constants.MaxUint256)) break;

    const size = i === 0 ? firstAskOrderSize : currentAskSize;

    asks.push([
      parseFloat(ethers.utils.formatUnits(currentAskPrice, 18)),
      parseFloat(
        ethers.utils.formatUnits(
          size,
          log10BigNumber(marketParams.sizePrecision)
        )
      ),
    ]);

    // Next ask price = currentPrice * (1000 + spreadConstant) / 1000
    currentAskPrice = mulDivRound(
      currentAskPrice,
      BigNumber.from(1000).add(spreadConstant),
      BigNumber.from(1000)
    );

    // Next ask size = currentSize * 2000 / (2000 + spreadConstant)
    currentAskSize = mulDivRound(
      currentAskSize,
      BigNumber.from(2000),
      BigNumber.from(2000).add(spreadConstant)
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
