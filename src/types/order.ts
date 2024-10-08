import { BigNumber } from "ethers"

export interface LIMIT {
    price: number,
    size: number,
    isBuy: boolean,
    postOnly: boolean
}

export interface MARKET {
    approveTokens: boolean,
    isBuy: boolean,
    size: number,
    minAmountOut: BigNumber,
    isMargin: boolean,
    fillOrKill: boolean
}

export interface BATCH {
    limitOrders: LIMIT[],
    cancelOrders: BigNumber[],
    postOnly: boolean
}
