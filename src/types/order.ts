import { BigNumber } from "ethers"

export interface LIMIT {
    price: number,
    size: number,
    isBuy: boolean,
    postOnly: boolean
}

export interface MARKET {
    isBuy: boolean,
    size: number,
    fillOrKill: boolean
}

export interface BATCH {
    limitOrders: LIMIT[],
    cancelOrders: BigNumber[],
    postOnly: boolean
}
