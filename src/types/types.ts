import { BigNumber } from "ethers";

export interface OrderBookData {
    asks: number[][];
    bids: number[][];
    blockNumber: number;
}

export interface WssOrderEvent {
    orderId: number;
    owner: string;
    size: BigNumber;
    price: BigNumber;
    isBuy: boolean;
    blockNumber: BigNumber;
    transactionHash: string;
    triggerTime: number;
}

export interface CanceledOrder {
    orderid: number;
    owner: string;
    size: string;
    price: string;
    isbuy: boolean;
    remainingsize: string;
    iscanceled: boolean;
    blocknumber: string;
    transactionhash: string;
    triggertime: string;
}

export interface WssCanceledOrderEvent {
    orderIds: number[];
    makerAddress: string;
    canceledOrdersData: CanceledOrder[];
}

export interface WssTradeEvent {
    orderId: number;
    makerAddress: string;
    isBuy: boolean;
    price: string;
    updatedSize: string;
    takerAddress: string;
    filledSize: string;
    blockNumber: string;
    transactionHash: string;
    triggerTime: number;
}

export interface ActiveOrders {
    orderIds: BigNumber[];
    blockNumber: number;
}

export interface Order {
    ownerAddress: string;
    size: number;
    prev: number;
    next: number;
    price: number;
    isBuy: boolean;
}

export interface MarketParams {
    pricePrecision: BigNumber;
    sizePrecision: BigNumber;
    baseAssetAddress: string;
    baseAssetDecimals: BigNumber;
    quoteAssetAddress: string;
    quoteAssetDecimals: BigNumber;
    tickSize: BigNumber;
    minSize: BigNumber;
    maxSize: BigNumber;
    takerFeeBps: BigNumber;
    makerFeeBps: BigNumber;
}

export interface VaultParams {
    kuruAmmVault: string;
    vaultBestBid: BigNumber;
    bidPartiallyFilledSize: BigNumber;
    vaultBestAsk: BigNumber;
    askPartiallyFilledSize: BigNumber;
    vaultBidOrderSize: BigNumber;
    vaultAskOrderSize: BigNumber;
    spread: BigNumber;
}

export interface OrderEvent {
    orderId: BigNumber;
    ownerAddress: string;
    size: BigNumber;
    price: BigNumber;
    isBuy: boolean;
}

export interface TradeEvent {
    orderId: BigNumber;
    isBuy: boolean;
    price: BigNumber;
    updatedSize: BigNumber;
    takerAddress: string;
    filledSize: BigNumber;
}
