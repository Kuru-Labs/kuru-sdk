
export interface OrderBookData {
    asks: number[][];
    bids: number[][];
    blockNumber: number;
    vaultParams: VaultParams;
    manualOrders: {
        bids: number[][];
        asks: number[][];
    };
}

export interface WssOrderEvent {
    orderId: bigint;
    owner: string;
    size: bigint;
    price: bigint;
    isBuy: boolean;
    blockNumber: bigint;
    transactionHash: string;
    triggerTime: number;
    marketAddress: string;
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
    orderIds: BigInt[];
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
    pricePrecision: bigint;
    sizePrecision: bigint;
    baseAssetAddress: string;
    baseAssetDecimals: bigint;
    quoteAssetAddress: string;
    quoteAssetDecimals: bigint;
    tickSize: bigint;
    minSize: bigint;
    maxSize: bigint;
    takerFeeBps: bigint;
    makerFeeBps: bigint;
}

export interface VaultParams {
    kuruAmmVault: string;
    vaultBestBid: bigint;
    bidPartiallyFilledSize: bigint;
    vaultBestAsk: bigint;
    askPartiallyFilledSize: bigint;
    vaultBidOrderSize: bigint;
    vaultAskOrderSize: bigint;
    spread: bigint;
}

export interface OrderEvent {
    orderId: bigint;
    ownerAddress: string;
    size: bigint;
    price: bigint;
    isBuy: boolean;
}

export interface TradeEvent {
    orderId: bigint;
    isBuy: boolean;
    price: bigint;
    updatedSize: bigint;
    takerAddress: string;
    filledSize: bigint;
}
