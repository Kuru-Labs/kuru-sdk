// ============ External Imports ============
import { ethers, BigNumber } from "ethers";

// ============ Internal Imports ============
import {
    extractErrorMessage,
    log10BigNumber,
    approveToken,
    estimateApproveGas,
} from "../utils";
import { MarketParams, MARKET } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";
import erc20Abi from "../../abi/IERC20.json";

export abstract class IOC {
    /**
     * @dev Places a market order (buy or sell) on the order book.
     * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param marketParams - The market parameters including price and size precision.
     * @param order - The market order object containing isBuy, size, and fillOrKill properties.
     * @returns A promise that resolves to the credited size.
     */
    static async placeMarket(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        marketParams: MarketParams,
        order: MARKET
    ): Promise<number> {
        const orderbook = new ethers.Contract(
            orderbookAddress,
            orderbookAbi.abi,
            providerOrSigner
        );

        return order.isBuy
            ? placeAndExecuteMarketBuy(
                  providerOrSigner,
                  orderbook,
                  orderbookAddress,
                  marketParams,
                  order.approveTokens,
                  order.size,
                  order.minAmountOut,
                  order.isMargin ?? false,
                  order.fillOrKill
              )
            : placeAndExecuteMarketSell(
                  providerOrSigner,
                  orderbook,
                  orderbookAddress,
                  marketParams,
                  order.approveTokens,
                  order.size,
                  order.minAmountOut,
                  order.isMargin ?? false,
                  order.fillOrKill
              );
    }

    static async estimateGas(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        marketParams: MarketParams,
        order: MARKET,
        slippageTolerance: number
    ): Promise<BigNumber> {
        const orderbook = new ethers.Contract(
            orderbookAddress,
            orderbookAbi.abi,
            providerOrSigner
        );

        const size = (order.size * (100 - slippageTolerance)) / 100;

        if (order.approveTokens) {
            return estimateApproveGas(
                new ethers.Contract(
                    marketParams.quoteAssetAddress,
                    erc20Abi.abi,
                    providerOrSigner
                ),
                orderbookAddress,
                ethers.utils.parseUnits(
                    size.toString(),
                    marketParams.quoteAssetDecimals
                )
            );
        }

        return order.isBuy
            ? estimateGasBuy(
                  orderbook,
                  marketParams,
                  size,
                  order.minAmountOut,
                  order.isMargin ?? false,
                  order.fillOrKill
              )
            : estimateGasSell(
                  orderbook,
                  marketParams,
                  size,
                  order.minAmountOut,
                  order.isMargin ?? false,
                  order.fillOrKill
              );
    }
}

// ======================== INTERNAL HELPER FUNCTIONS ========================

/**
 * @dev Places and executes a market buy order.
 * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
 * @param orderbook - The order book contract instance.
 * @param marketAddress - The address of the market contract.
 * @param marketParams - The market parameters including price and size precision.
 * @param quoteSize - The size of the quote asset.
 * @param isFillOrKill - A boolean indicating whether the order should be fill-or-kill.
 * @returns A promise that resolves to the credited size.
 */
async function placeAndExecuteMarketBuy(
    providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    orderbook: ethers.Contract,
    marketAddress: string,
    marketParams: MarketParams,
    approveTokens: boolean,
    quoteSize: number,
    minAmountOut: number,
    isMargin: boolean,
    isFillOrKill: boolean
): Promise<number> {
    const parsedQuoteSize = ethers.utils.parseUnits(
        quoteSize.toString(),
        marketParams.quoteAssetDecimals
    );

    const parsedMinAmountOut = ethers.utils.parseUnits(
        minAmountOut.toString(),
        marketParams.quoteAssetDecimals
    );

    if (
        approveTokens &&
        marketParams.quoteAssetAddress !== ethers.constants.AddressZero &&
        !isMargin
    ) {
        const tokenContract = new ethers.Contract(
            marketParams.quoteAssetAddress,
            erc20Abi.abi,
            providerOrSigner
        );
        await approveToken(
            tokenContract,
            marketAddress,
            parsedQuoteSize,
            providerOrSigner
        );
    }

    try {
        const tx = await orderbook.placeAndExecuteMarketBuy(
            ethers.utils.parseUnits(
                quoteSize.toString(),
                log10BigNumber(marketParams.pricePrecision)
            ),
            parsedMinAmountOut,
            isMargin,
            isFillOrKill,
            {
                value:
                    !isMargin &&
                    marketParams.quoteAssetAddress ===
                        ethers.constants.AddressZero
                        ? parsedQuoteSize
                        : 0,
            }
        );
        await tx.wait();
        return tx.value;
    } catch (e: any) {
        console.log({ e });
        if (!e.error) {
            throw e;
        }
        throw extractErrorMessage(e);
    }
}

async function estimateGasBuy(
    orderbook: ethers.Contract,
    marketParams: MarketParams,
    quoteSize: number,
    minAmountOut: number,
    isMargin: boolean,
    isFillOrKill: boolean
): Promise<BigNumber> {
    try {
        const gasEstimate =
            await orderbook.estimateGas.placeAndExecuteMarketBuy(
                ethers.utils.parseUnits(
                    quoteSize.toString(),
                    log10BigNumber(marketParams.pricePrecision)
                ),
                minAmountOut,
                isMargin,
                isFillOrKill
            );
        return gasEstimate;
    } catch (e: any) {
        if (!e.error) {
            throw e;
        }
        throw extractErrorMessage(e);
    }
}

/**
 * @dev Places and executes a market sell order.
 * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
 * @param orderbook - The order book contract instance.
 * @param marketAddress - The address of the market contract.
 * @param marketParams - The market parameters including price and size precision.
 * @param size - The size of the base asset.
 * @param isFillOrKill - A boolean indicating whether the order should be fill-or-kill.
 * @returns A promise that resolves to the credited size.
 */
async function placeAndExecuteMarketSell(
    providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    orderbook: ethers.Contract,
    marketAddress: string,
    marketParams: MarketParams,
    approveTokens: boolean,
    size: number,
    minAmountOut: number,
    isMargin: boolean,
    isFillOrKill: boolean
): Promise<number> {
    const parsedSize = ethers.utils.parseUnits(
        size.toString(),
        marketParams.baseAssetDecimals
    );

    const parsedMinAmountOut = ethers.utils.parseUnits(
        minAmountOut.toString(),
        marketParams.baseAssetDecimals
    );

    if (
        approveTokens &&
        marketParams.baseAssetAddress !== ethers.constants.AddressZero &&
        !isMargin
    ) {
        const tokenContract = new ethers.Contract(
            marketParams.baseAssetAddress,
            erc20Abi.abi,
            providerOrSigner
        );
        await approveToken(
            tokenContract,
            marketAddress,
            parsedSize,
            providerOrSigner
        );
    }

    try {
        const tx = await orderbook.placeAndExecuteMarketSell(
            ethers.utils.parseUnits(
                size.toString(),
                log10BigNumber(marketParams.sizePrecision)
            ),
            parsedMinAmountOut,
            isMargin,
            isFillOrKill,
            {
                value:
                    !isMargin &&
                    marketParams.baseAssetAddress ===
                        ethers.constants.AddressZero
                        ? parsedSize
                        : 0,
            }
        );
        await tx.wait();
        return tx.value;
    } catch (e: any) {
        console.log({ e });

        if (!e.error) {
            throw e;
        }
        throw extractErrorMessage(e);
    }
}

async function estimateGasSell(
    orderbook: ethers.Contract,
    marketParams: MarketParams,
    size: number,
    minAmountOut: number,
    isMargin: boolean,
    isFillOrKill: boolean
): Promise<BigNumber> {
    try {
        const gasEstimate =
            await orderbook.estimateGas.placeAndExecuteMarketSell(
                ethers.utils.parseUnits(
                    size.toString(),
                    log10BigNumber(marketParams.sizePrecision)
                ),
                minAmountOut,
                isMargin,
                isFillOrKill
            );

        return gasEstimate;
    } catch (e: any) {
        if (!e.error) {
            throw e;
        }
        throw extractErrorMessage(e);
    }
}
