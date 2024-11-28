// ============ External Imports ============
import { ethers, BigNumber, ContractReceipt } from "ethers";

// ============ Internal Imports ============
import {
    extractErrorMessage,
    log10BigNumber,
    approveToken,
    estimateApproveGas,
} from "../utils";
import { MarketParams, MARKET, TransactionOptions } from "../types";

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
    ): Promise<ContractReceipt> {
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
                  order.fillOrKill,
                  order.txOptions
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
                  order.fillOrKill,
                  order.txOptions
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

    /**
     * @dev Constructs a market buy transaction.
     * @param signer - The signer instance.
     * @param orderbookAddress - The address of the order book contract.
     * @param marketParams - The market parameters including price and size precision.
     * @param quoteSize - The size of the quote asset to spend.
     * @param minAmountOut - The minimum amount of base asset to receive.
     * @param isMargin - Whether this is a margin trade.
     * @param isFillOrKill - Whether the order should be fill-or-kill.
     * @param txOptions - Optional transaction parameters like gas price and nonce.
     */
    static async constructMarketBuyTransaction(
        signer: ethers.Signer,
        orderbookAddress: string,
        marketParams: MarketParams,
        quoteSize: number,
        minAmountOut: BigNumber,
        isMargin: boolean,
        isFillOrKill: boolean,
        txOptions?: TransactionOptions
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();
        const orderbookInterface = new ethers.utils.Interface(orderbookAbi.abi);

        const data = orderbookInterface.encodeFunctionData("placeAndExecuteMarketBuy", [
            ethers.utils.parseUnits(
                quoteSize.toString(),
                log10BigNumber(marketParams.pricePrecision)
            ),
            minAmountOut,
            isMargin,
            isFillOrKill
        ]);

        const parsedQuoteSize = ethers.utils.parseUnits(
            quoteSize.toString(),
            marketParams.quoteAssetDecimals
        );

        const tx: ethers.providers.TransactionRequest = {
            to: orderbookAddress,
            from: address,
            data,
            value: !isMargin && marketParams.quoteAssetAddress === ethers.constants.AddressZero
                ? parsedQuoteSize
                : BigNumber.from(0),
            ...(txOptions?.nonce !== undefined && { nonce: txOptions.nonce }),
            ...(txOptions?.gasLimit && { gasLimit: txOptions.gasLimit }),
            ...(txOptions?.gasPrice && { gasPrice: txOptions.gasPrice }),
            ...(txOptions?.maxFeePerGas && { maxFeePerGas: txOptions.maxFeePerGas }),
            ...(txOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: txOptions.maxPriorityFeePerGas })
        };

        const [gasLimit, baseGasPrice] = await Promise.all([
            !tx.gasLimit ? signer.estimateGas({
                ...tx,
                gasPrice: ethers.utils.parseUnits('1', 'gwei'),
            }) : Promise.resolve(tx.gasLimit),
            (!tx.gasPrice && !tx.maxFeePerGas) ? signer.provider!.getGasPrice() : Promise.resolve(undefined)
        ]);

        if (!tx.gasLimit) {
            tx.gasLimit = gasLimit;
        }

        if (!tx.gasPrice && !tx.maxFeePerGas && baseGasPrice) {
            if (txOptions?.priorityFee) {
                const priorityFeeWei = ethers.utils.parseUnits(
                    txOptions.priorityFee.toString(),
                    'gwei'
                );
                tx.gasPrice = baseGasPrice.add(priorityFeeWei);
            } else {
                tx.gasPrice = baseGasPrice;
            }
        }

        return tx;
    }

    /* @dev Constructs a market sell transaction.
    * @param signer - The signer instance.
    * @param orderbookAddress - The address of the order book contract.
    * @param marketParams - The market parameters including price and size precision.
    * @param size - The size of the base asset to sell.
    * @param minAmountOut - The minimum amount of quote asset to receive.
    */
    static async constructMarketSellTransaction(
        signer: ethers.Signer,
        orderbookAddress: string,
        marketParams: MarketParams,
        size: number,
        minAmountOut: BigNumber,
        isMargin: boolean,
        isFillOrKill: boolean,
        txOptions?: TransactionOptions
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();
        const orderbookInterface = new ethers.utils.Interface(orderbookAbi.abi);

        const data = orderbookInterface.encodeFunctionData("placeAndExecuteMarketSell", [
            ethers.utils.parseUnits(
                size.toString(), 
                log10BigNumber(marketParams.sizePrecision)
            ),
            minAmountOut,
            isMargin,
            isFillOrKill
        ]);
   
        const parsedSize = ethers.utils.parseUnits(
            size.toString(),
            marketParams.baseAssetDecimals
        );
   
        const tx: ethers.providers.TransactionRequest = {
            to: orderbookAddress,
            from: address,
            data,
            value: !isMargin && marketParams.baseAssetAddress === ethers.constants.AddressZero
                ? parsedSize
                : BigNumber.from(0),
            ...(txOptions?.nonce !== undefined && { nonce: txOptions.nonce }),
            ...(txOptions?.gasLimit && { gasLimit: txOptions.gasLimit }),
            ...(txOptions?.gasPrice && { gasPrice: txOptions.gasPrice }),
            ...(txOptions?.maxFeePerGas && { maxFeePerGas: txOptions.maxFeePerGas }),
            ...(txOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: txOptions.maxPriorityFeePerGas })
        };
   
        const [gasLimit, baseGasPrice] = await Promise.all([
            !tx.gasLimit ? signer.estimateGas({
                ...tx,
                gasPrice: ethers.utils.parseUnits('1', 'gwei'),
            }) : Promise.resolve(tx.gasLimit),
            (!tx.gasPrice && !tx.maxFeePerGas) ? signer.provider!.getGasPrice() : Promise.resolve(undefined)
        ]);
   
        if (!tx.gasLimit) {
            tx.gasLimit = gasLimit;
        }
   
        if (!tx.gasPrice && !tx.maxFeePerGas && baseGasPrice) {
            if (txOptions?.priorityFee) {
                const priorityFeeWei = ethers.utils.parseUnits(
                    txOptions.priorityFee.toString(),
                    'gwei'
                );
                tx.gasPrice = baseGasPrice.add(priorityFeeWei);
            } else {
                tx.gasPrice = baseGasPrice;
            }
        }
   
        return tx;
   }
}

// ======================== INTERNAL HELPER FUNCTIONS ========================



/**
 * @dev Places and executes a market buy order.
 * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
 * @param orderbook - The order book contract instance.
 * @param marketAddress - The address of the market contract.
 * @param marketParams - The market parameters including price and size precision.
 * @param approveTokens - Whether to approve token spending before placing the order.
 * @param quoteSize - The size of the quote asset to spend.
 * @param minAmountOut - The minimum amount of base asset to receive.
 * @param isMargin - Whether this is a margin trade.
 * @param isFillOrKill - Whether the order should be fill-or-kill.
 * @param txOptions - Optional transaction parameters like gas price and nonce.
 * @returns A promise that resolves to the transaction receipt.
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
    isFillOrKill: boolean,
    txOptions?: TransactionOptions
): Promise<ContractReceipt> {
    const parsedQuoteSize = ethers.utils.parseUnits(
        quoteSize.toString(),
        marketParams.quoteAssetDecimals
    );

    const parsedMinAmountOut = ethers.utils.parseUnits(
        minAmountOut.toString(),
        marketParams.baseAssetDecimals
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
        const tx = await IOC.constructMarketBuyTransaction(
            orderbook.signer,
            orderbook.address,
            marketParams,
            quoteSize,
            parsedMinAmountOut,
            isMargin,
            isFillOrKill,
            txOptions
        );
        const transaction = await orderbook.signer.sendTransaction(tx);
        const receipt = await transaction.wait(1);

        return receipt;
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
 * @param approveTokens - Whether to approve token spending before placing the order.
 * @param size - The size of the base asset to sell.
 * @param minAmountOut - The minimum amount of quote asset to receive.
 * @param isMargin - Whether this is a margin trade.
 * @param isFillOrKill - Whether the order should be fill-or-kill.
 * @param txOptions - Optional transaction parameters like gas price and nonce.
 * @returns A promise that resolves to the transaction receipt.
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
    isFillOrKill: boolean,
    txOptions?: TransactionOptions
): Promise<ContractReceipt> {
    const parsedSize = ethers.utils.parseUnits(
        size.toString(),
        marketParams.baseAssetDecimals
    );

    const parsedMinAmountOut = ethers.utils.parseUnits(
        minAmountOut.toString(),
        marketParams.quoteAssetDecimals
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
        const tx = await IOC.constructMarketSellTransaction(
            orderbook.signer,
            orderbook.address,
            marketParams,
            size,
            parsedMinAmountOut,
            isMargin,
            isFillOrKill,
            txOptions
        );

        const transaction = await orderbook.signer.sendTransaction(tx);
        const receipt = await transaction.wait();

        return receipt;
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
