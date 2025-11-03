// ============ External Imports ============
import { BigNumber, ContractReceipt, ethers } from 'ethers';

// ============ Internal Imports ============
import { LIMIT, MarketParams, TransactionOptions } from '../types';
import { clipToDecimals, extractErrorMessage, log10BigNumber } from '../utils';

// ============ Config Imports ============
import orderbookAbi from '../../abi/OrderBook.json';
import buildTransactionRequest from '../utils/txConfig';

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
        const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi.abi, providerOrSigner);
        const signer = providerOrSigner instanceof ethers.Signer ? providerOrSigner : providerOrSigner.getSigner();

        const clippedPrice = clipToDecimals(order.price, log10BigNumber(marketParams.pricePrecision));
        const clippedSize = clipToDecimals(order.size, log10BigNumber(marketParams.sizePrecision));

        const priceBn: BigNumber = ethers.utils.parseUnits(clippedPrice, log10BigNumber(marketParams.pricePrecision));
        const sizeBn: BigNumber = ethers.utils.parseUnits(clippedSize, log10BigNumber(marketParams.sizePrecision));

        return order.isBuy
            ? GTC.addBuyOrder(signer, orderbook, priceBn, sizeBn, order.postOnly, order.txOptions)
            : GTC.addSellOrder(signer, orderbook, priceBn, sizeBn, order.postOnly, order.txOptions);
    }

    static async estimateGas(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        marketParams: MarketParams,
        order: LIMIT,
    ): Promise<BigNumber> {
        const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi.abi, providerOrSigner);

        const clippedPrice = clipToDecimals(order.price, log10BigNumber(marketParams.pricePrecision));
        const clippedSize = clipToDecimals(order.size, log10BigNumber(marketParams.sizePrecision));

        const priceBn: BigNumber = ethers.utils.parseUnits(clippedPrice, log10BigNumber(marketParams.pricePrecision));
        const sizeBn: BigNumber = ethers.utils.parseUnits(clippedSize, log10BigNumber(marketParams.sizePrecision));

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
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();

        const orderbookInterface = new ethers.utils.Interface(orderbookAbi.abi);
        const data = orderbookInterface.encodeFunctionData('addBuyOrder', [price, size, postOnly]);

        return buildTransactionRequest({
            to: orderbookAddress,
            from: address,
            data,
            txOptions,
            signer,
        });
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
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();

        const orderbookInterface = new ethers.utils.Interface(orderbookAbi.abi);
        const data = orderbookInterface.encodeFunctionData('addSellOrder', [price, size, postOnly]);

        return buildTransactionRequest({
            to: orderbookAddress,
            from: address,
            data,
            txOptions,
            signer,
        });
    }

    /**
     * @dev Places a buy limit order on the order book.
     */
    static async addBuyOrder(
        signer: ethers.Signer,
        orderbook: ethers.Contract,
        price: BigNumber,
        size: BigNumber,
        postOnly: boolean,
        txOptions?: TransactionOptions,
    ): Promise<ContractReceipt> {
        try {
            const tx = await GTC.constructBuyOrderTransaction(
                signer,
                orderbook.address,
                price,
                size,
                postOnly,
                txOptions,
            );

            const transaction = await signer.sendTransaction(tx);
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
        signer: ethers.Signer,
        orderbook: ethers.Contract,
        price: BigNumber,
        size: BigNumber,
        postOnly: boolean,
        txOptions?: TransactionOptions,
    ): Promise<ContractReceipt> {
        try {
            const tx = await GTC.constructSellOrderTransaction(
                signer,
                orderbook.address,
                price,
                size,
                postOnly,
                txOptions,
            );

            const transaction = await signer.sendTransaction(tx);
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
    postOnly: boolean,
): Promise<BigNumber> {
    try {
        const gasEstimate = await orderbook.estimateGas.addBuyOrder(price, size, postOnly);
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
    postOnly: boolean,
): Promise<BigNumber> {
    try {
        const gasEstimate = await orderbook.estimateGas.addSellOrder(price, size, postOnly);
        return gasEstimate;
    } catch (e: any) {
        if (!e.error) {
            throw e;
        }
        throw extractErrorMessage(e);
    }
}
