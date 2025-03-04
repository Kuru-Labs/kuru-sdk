import { BigNumber } from "ethers";

export interface TransactionOptions {
    nonce?: number;
    gasPrice?: BigNumber;
    gasLimit?: BigNumber;
    maxFeePerGas?: BigNumber;
    maxPriorityFeePerGas?: BigNumber;
    priorityFee?: number;
}

export interface LIMIT {
    price: string;
    size: string;
    isBuy: boolean;
    postOnly: boolean;
    txOptions?: TransactionOptions;
}

export interface MARKET {
    approveTokens: boolean;
    isBuy: boolean;
    size: string;
    minAmountOut: string;
    isMargin: boolean;
    fillOrKill: boolean;
    txOptions?: TransactionOptions;
}

export interface BATCH {
    limitOrders: LIMIT[];
    cancelOrders: BigNumber[];
    postOnly: boolean;
    txOptions?: TransactionOptions;
}
