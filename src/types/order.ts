
export interface TransactionOptions {
    nonce?: number;
    gasPrice?: BigInt;
    gasLimit?: BigInt;
    maxFeePerGas?: BigInt;
    maxPriorityFeePerGas?: BigInt;
    priorityFee?: number;
}

export interface LIMIT {
    price: number;
    size: number;
    isBuy: boolean;
    postOnly: boolean;
    txOptions?: TransactionOptions;
}

export interface MARKET {
    approveTokens: boolean;
    isBuy: boolean;
    size: number;
    minAmountOut: number;
    isMargin: boolean;
    fillOrKill: boolean;
    txOptions?: TransactionOptions;
}

export interface BATCH {
    limitOrders: LIMIT[];
    cancelOrders: BigInt[];
    postOnly: boolean;
    txOptions?: TransactionOptions;
}
