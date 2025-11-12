// ============ External Imports ============
import { ethers, BigNumber, ContractReceipt } from 'ethers';

// ============ Internal Imports ============
import { clipToDecimals, extractErrorMessage, log10BigNumber } from '../utils';
import { MarketParams, LIMIT, TransactionOptions } from '../types';

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

        const clippedPrice = clipToDecimals(order.price, log10BigNumber(marketParams.pricePrecision));
        const clippedSize = clipToDecimals(order.size, log10BigNumber(marketParams.sizePrecision));

        const priceBn: BigNumber = ethers.utils.parseUnits(clippedPrice, log10BigNumber(marketParams.pricePrecision));
        const sizeBn: BigNumber = ethers.utils.parseUnits(clippedSize, log10BigNumber(marketParams.sizePrecision));

        return order.isBuy
            ? GTC.addBuyOrder(orderbook, priceBn, sizeBn, order.postOnly, order.txOptions)
            : GTC.addSellOrder(orderbook, priceBn, sizeBn, order.postOnly, order.txOptions);
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
     * @dev Computes the storage key used by ERC-20 contracts for a user's balance mapping.
     * @param owner - The address whose balance slot should be derived.
     * @param token - The token contract address.
     * @returns Keccak hash representing the account key inside the ERC-20 `balances` mapping.
     */
    static computeAccountKey(owner: string, token: string): string {
        return ethers.utils.keccak256(ethers.utils.solidityPack(['address', 'address'], [owner, token]));
    }

    /**
     * @dev Calculates the full storage slot for an ERC-20 `balanceOf(owner)` entry.
     * @param owner - The address whose balance slot is needed.
     * @param token - The token contract address.
     * @returns Storage slot (keccak hash) for the `balanceOf(owner)` inside the token contract.
     */
    static computeBalanceSlot(owner: string, token: string): string {
        const accountKey = this.computeAccountKey(owner, token);
        const slotBytes = ethers.utils.hexZeroPad(ethers.utils.hexlify(ethers.constants.One), 32);
        return ethers.utils.keccak256(
            ethers.utils.concat([ethers.utils.arrayify(accountKey), ethers.utils.arrayify(slotBytes)]),
        );
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
        marginAccountAddress?: string,
        tokenAddress?: string,
        amount?: BigNumber,
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();
        const provider = signer.provider as ethers.providers.JsonRpcProvider | undefined;
        if (!provider) {
            throw new Error('Signer must be connected to a provider to estimate gas.');
        }
        let mergedTxOptions: TransactionOptions | undefined;

        const orderbookInterface = new ethers.utils.Interface(orderbookAbi.abi);
        const data = orderbookInterface.encodeFunctionData('addBuyOrder', [price, size, postOnly]);

        if (marginAccountAddress && tokenAddress && amount) {
            // do estimateGas with state overrides
            const balanceSlot = this.computeBalanceSlot(marginAccountAddress, tokenAddress);
            const paddedAmount = ethers.utils.hexZeroPad(amount.toHexString(), 32);

            const stateOverrides: Record<string, { storage: Record<string, string> }> = {};
            stateOverrides[tokenAddress] = {
                storage: {
                    [balanceSlot]: paddedAmount,
                },
            };
            const estimatedGasHex = await provider.send('eth_estimateGas', [
                {
                    from: address,
                    to: orderbookAddress,
                    data,
                },
                'latest',
                stateOverrides,
            ]);
            const estimatedGas = BigNumber.from(estimatedGasHex);
            const bufferedGas = estimatedGas.mul(120).div(100);
            mergedTxOptions =
                txOptions && txOptions.gasLimit !== undefined ? txOptions : { ...txOptions, gasLimit: bufferedGas };
        } else {
            // do estimateGas without state overrides
            const estimatedGasHex = await provider.send('eth_estimateGas', [
                {
                    from: address,
                    to: orderbookAddress,
                    data,
                },
                'latest',
            ]);
            const estimatedGas = BigNumber.from(estimatedGasHex);
            const bufferedGas = estimatedGas.mul(120).div(100);
            mergedTxOptions =
                txOptions && txOptions.gasLimit !== undefined ? txOptions : { ...txOptions, gasLimit: bufferedGas };
        }

        return buildTransactionRequest({
            to: orderbookAddress,
            from: address,
            data,
            txOptions: mergedTxOptions,
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
        marginAccountAddress?: string,
        tokenAddress?: string,
        amount?: BigNumber,
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();
        const provider = signer.provider as ethers.providers.JsonRpcProvider | undefined;
        if (!provider) {
            throw new Error('Signer must be connected to a provider to estimate gas.');
        }
        let mergedTxOptions: TransactionOptions | undefined;

        const orderbookInterface = new ethers.utils.Interface(orderbookAbi.abi);
        const data = orderbookInterface.encodeFunctionData('addSellOrder', [price, size, postOnly]);

        if (marginAccountAddress && tokenAddress && amount) {
            // do estimateGas with state overrides
            const balanceSlot = this.computeBalanceSlot(marginAccountAddress, tokenAddress);
            const paddedAmount = ethers.utils.hexZeroPad(amount.toHexString(), 32);

            const stateOverrides: Record<string, { storage: Record<string, string> }> = {};
            stateOverrides[tokenAddress] = {
                storage: {
                    [balanceSlot]: paddedAmount,
                },
            };
            const estimatedGasHex = await provider.send('eth_estimateGas', [
                {
                    from: address,
                    to: orderbookAddress,
                    data,
                },
                'latest',
                stateOverrides,
            ]);
            const estimatedGas = BigNumber.from(estimatedGasHex);
            const bufferedGas = estimatedGas.mul(120).div(100);
            mergedTxOptions =
                txOptions && txOptions.gasLimit !== undefined ? txOptions : { ...txOptions, gasLimit: bufferedGas };
        } else {
            // do estimateGas without state overrides
            const estimatedGasHex = await provider.send('eth_estimateGas', [
                {
                    from: address,
                    to: orderbookAddress,
                    data,
                },
                'latest',
            ]);
            const estimatedGas = BigNumber.from(estimatedGasHex);
            const bufferedGas = estimatedGas.mul(120).div(100);
            mergedTxOptions =
                txOptions && txOptions.gasLimit !== undefined ? txOptions : { ...txOptions, gasLimit: bufferedGas };
        }

        return buildTransactionRequest({
            to: orderbookAddress,
            from: address,
            data,
            txOptions: mergedTxOptions,
            signer,
        });
    }

    /**
     * @dev Places a buy limit order on the order book.
     */
    static async addBuyOrder(
        orderbook: ethers.Contract,
        price: BigNumber,
        size: BigNumber,
        postOnly: boolean,
        txOptions?: TransactionOptions,
    ): Promise<ContractReceipt> {
        try {
            const tx = await GTC.constructBuyOrderTransaction(
                orderbook.signer,
                orderbook.address,
                price,
                size,
                postOnly,
                undefined,
                undefined,
                undefined,
                txOptions,
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
        txOptions?: TransactionOptions,
    ): Promise<ContractReceipt> {
        try {
            const tx = await GTC.constructSellOrderTransaction(
                orderbook.signer,
                orderbook.address,
                price,
                size,
                postOnly,
                undefined,
                undefined,
                undefined,
                txOptions,
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
