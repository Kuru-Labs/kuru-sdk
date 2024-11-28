// ============ External Imports ============
import { ethers, BigNumber, ContractReceipt } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage, log10BigNumber } from "../utils";
import { MarketParams, LIMIT, TransactionOptions } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";

export abstract class GTC {
    /**
     * @dev Places a limit order (buy or sell) on the order book.
     * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param marketParams - The market parameters including price and size precision.
     * @param order - The limit order object containing price, size, isBuy, and postOnly properties.
     * @param txOptions - The transaction options for the order.
     * @returns A promise that resolves to a boolean indicating success or failure.
     */
    static async placeLimit(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        marketParams: MarketParams,
        order: LIMIT,
    ): Promise<ContractReceipt> {
        const orderbook = new ethers.Contract(
            orderbookAddress,
            orderbookAbi.abi,
            providerOrSigner
        );

        const clippedPrice = order.price.toFixed(
            log10BigNumber(marketParams.pricePrecision)
        );
        const clippedSize = order.size.toFixed(
            log10BigNumber(marketParams.sizePrecision)
        );

        const priceBn: BigNumber = ethers.utils.parseUnits(
            clippedPrice.toString(),
            log10BigNumber(marketParams.pricePrecision)
        );
        const sizeBn: BigNumber = ethers.utils.parseUnits(
            clippedSize.toString(),
            log10BigNumber(marketParams.sizePrecision)
        );

        return order.isBuy
            ? GTC.addBuyOrder(orderbook, priceBn, sizeBn, order.postOnly, order.txOptions)
            : GTC.addSellOrder(orderbook, priceBn, sizeBn, order.postOnly, order.txOptions);
    }

    static async estimateGas(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        marketParams: MarketParams,
        order: LIMIT
    ): Promise<BigNumber> {
        const orderbook = new ethers.Contract(
            orderbookAddress,
            orderbookAbi.abi,
            providerOrSigner
        );

        const clippedPrice = order.price.toFixed(
            log10BigNumber(marketParams.pricePrecision)
        );
        const clippedSize = order.size.toFixed(
            log10BigNumber(marketParams.sizePrecision)
        );

        const priceBn: BigNumber = ethers.utils.parseUnits(
            clippedPrice.toString(),
            log10BigNumber(marketParams.pricePrecision)
        );
        const sizeBn: BigNumber = ethers.utils.parseUnits(
            clippedSize.toString(),
            log10BigNumber(marketParams.sizePrecision)
        );

        return order.isBuy
            ? estimateGasBuy(orderbook, priceBn, sizeBn, order.postOnly)
            : estimateGasSell(orderbook, priceBn, sizeBn, order.postOnly);
    }

    /**
     * @dev Constructs a transaction for a buy limit order.
     * @param signer - The signer instance.
     * @param orderbookAddress - The address of the order book contract.
     * @param price - The price of the order.
     * @param size - The size of the order.
     * @param postOnly - Whether the order is post-only.
     * @param txOptions - Transaction options.
     * @returns A promise that resolves to the transaction request object.
     */
    static async constructBuyOrderTransaction(
        signer: ethers.Signer,
        orderbookAddress: string,
        price: BigNumber,
        size: BigNumber,
        postOnly: boolean,
        txOptions?: TransactionOptions
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();

        const orderbookInterface = new ethers.utils.Interface(orderbookAbi.abi);
        const data = orderbookInterface.encodeFunctionData("addBuyOrder", [
            price,
            size,
            postOnly
        ]);

        const tx: ethers.providers.TransactionRequest = {
            to: orderbookAddress,
            from: address,
            data,
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

    /**
     * @dev Constructs a transaction for a sell limit order.
     * @param signer - The signer instance.
     * @param orderbookAddress - The address of the order book contract.
     * @param price - The price of the order.
     * @param size - The size of the order.
     * @param postOnly - Whether the order is post-only.
     * @param txOptions - Transaction options.
     * @returns A promise that resolves to the transaction request object.
     */
    static async constructSellOrderTransaction(
        signer: ethers.Signer,
        orderbookAddress: string,
        price: BigNumber,
        size: BigNumber,
        postOnly: boolean,
        txOptions?: TransactionOptions
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();

        const orderbookInterface = new ethers.utils.Interface(orderbookAbi.abi);
        const data = orderbookInterface.encodeFunctionData("addSellOrder", [
            price,
            size,
            postOnly
        ]);

        const tx: ethers.providers.TransactionRequest = {
            to: orderbookAddress,
            from: address,
            data,
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

    /**
     * @dev Places a buy limit order on the order book.
     */
    static async addBuyOrder(
        orderbook: ethers.Contract,
        price: BigNumber,
        size: BigNumber,
        postOnly: boolean,
        txOptions?: TransactionOptions
    ): Promise<ContractReceipt> {
        try {
            const tx = await GTC.constructBuyOrderTransaction(
                orderbook.signer,
                orderbook.address,
                price,
                size,
                postOnly,
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

    /**
     * @dev Places a sell limit order on the order book.
     */
    static async addSellOrder(
        orderbook: ethers.Contract,
        price: BigNumber,
        size: BigNumber,
        postOnly: boolean,
        txOptions?: TransactionOptions
    ): Promise<ContractReceipt> {
        try {
            const tx = await GTC.constructSellOrderTransaction(
                orderbook.signer,
                orderbook.address,
                price,
                size,
                postOnly,
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
}

// ======================== INTERNAL HELPER FUNCTIONS ========================

async function estimateGasBuy(
    orderbook: ethers.Contract,
    price: BigNumber,
    size: BigNumber,
    postOnly: boolean
): Promise<BigNumber> {
    try {
        const gasEstimate = await orderbook.estimateGas.addBuyOrder(
            price,
            size,
            postOnly
        );
        return gasEstimate;
    } catch (e: any) {
        if (!e.error) {
            throw e;
        }
        throw extractErrorMessage(e);
    }
}

async function estimateGasSell(
    orderbook: ethers.Contract,
    price: BigNumber,
    size: BigNumber,
    postOnly: boolean
): Promise<BigNumber> {
    try {
        const gasEstimate = await orderbook.estimateGas.addSellOrder(
            price,
            size,
            postOnly
        );
        return gasEstimate;
    } catch (e: any) {
        if (!e.error) {
            throw e;
        }
        throw extractErrorMessage(e);
    }
}
