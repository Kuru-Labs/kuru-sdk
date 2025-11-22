import { ethers, ContractReceipt, BigNumber } from 'ethers';
import { BatchLPDetails } from './positionViewer';
import { TransactionOptions } from '../types';
import orderbookAbi from '../../abi/OrderBook.json';
import buildTransactionRequest from '../utils/txConfig';
import { computeBalanceSlotForMarginAccount } from '../utils/storageSlots';

const PADDED_AMOUNT = ethers.constants.MaxUint256.toHexString();

export abstract class PositionProvider {
    /**
     * @dev Submits a batch of liquidity positions to the contract
     * @param signer - The signer object
     * @param contractAddress - The contract address
     * @param batchDetails - The batch liquidity position details
     * @returns A promise that resolves to the transaction
     */
    static async provisionLiquidity(
        signer: ethers.Signer,
        contractAddress: string,
        batchDetails: BatchLPDetails,
    ): Promise<ContractReceipt> {
        // Create contract instance
        const contract = new ethers.Contract(contractAddress, orderbookAbi.abi, signer);

        const prices: bigint[] = [];
        const flipPrices: bigint[] = [];
        const sizes: bigint[] = [];
        const isBuy: boolean[] = [];

        // Add bids
        for (const bid of batchDetails.bids) {
            prices.push(bid.price);
            flipPrices.push(bid.flipPrice);
            sizes.push(bid.liquidity);
            isBuy.push(true);
        }

        // Add asks
        for (const ask of batchDetails.asks) {
            prices.push(ask.price);
            flipPrices.push(ask.flipPrice);
            sizes.push(ask.liquidity);
            isBuy.push(false);
        }

        // Call the contract with provisionOrRevert = false
        const tx = await contract.batchProvisionLiquidity(prices, flipPrices, sizes, isBuy, false);

        const receipt = await tx.wait();

        return receipt;
    }

    /**
     * @dev Constructs a transaction for batch liquidity provision
     * @param signer - The signer instance
     * @param contractAddress - The contract address
     * @param batchDetails - The batch liquidity position details
     * @param txOptions - Transaction options
     * @returns A promise that resolves to the transaction request object
     */
    static async constructBatchProvisionTransaction(
        provider: ethers.providers.JsonRpcProvider,
        signer: ethers.Signer,
        contractAddress: string,
        batchDetails: BatchLPDetails,
        txOptions?: TransactionOptions,
        marginAccountAddress?: string,
        assetsDeposit?: Record<string, { amount: BigNumber; decimal: number }>,
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();

        const prices: bigint[] = [];
        const flipPrices: bigint[] = [];
        const sizes: bigint[] = [];
        const isBuy: boolean[] = [];

        // Add bids
        for (const bid of batchDetails.bids) {
            prices.push(bid.price);
            flipPrices.push(bid.flipPrice);
            sizes.push(bid.liquidity);
            isBuy.push(true);
        }

        // Add asks
        for (const ask of batchDetails.asks) {
            prices.push(ask.price);
            flipPrices.push(ask.flipPrice);
            sizes.push(ask.liquidity);
            isBuy.push(false);
        }

        const orderbookInterface = new ethers.utils.Interface(orderbookAbi.abi);
        const data = orderbookInterface.encodeFunctionData('batchProvisionLiquidity', [
            prices,
            flipPrices,
            sizes,
            isBuy,
            false,
        ]);

        if (!marginAccountAddress || !assetsDeposit) {
            // no state overrides; rely on provided txOptions.gasLimit
            return buildTransactionRequest({
                from: address,
                to: contractAddress,
                signer,
                data,
                txOptions,
            });
        }

        const { gasLimit } = await PositionProvider.estimateGas(
            provider,
            signer,
            contractAddress,
            data,
            marginAccountAddress,
            assetsDeposit,
        );

        const mergedTxOptions = txOptions && txOptions.gasLimit !== undefined ? txOptions : { ...txOptions, gasLimit };

        return buildTransactionRequest({
            from: address,
            to: contractAddress,
            signer,
            data,
            txOptions: mergedTxOptions,
        });
    }
    /**
     * @dev Encodes `batchProvisionLiquidity` and estimates gas, optionally applying margin-account state overrides.
     * @param signer Signer used to perform the estimation request.
     * @param contractAddress Target order book contract that receives the call.
     * @param batchDetails Liquidity batch to be provisioned (bids/asks and totals).
     * @param marginAccountAddress Margin account whose balances are overridden for simulation.
     * @param assetsDeposit Mapping of token address to simulated deposit amount/decimals (only ERC-20 tokens supported).
     * @returns Buffered gas limit and the encoded calldata so callers can reuse both when constructing the transaction.
     */
    static async estimateGas(
        provider: ethers.providers.JsonRpcProvider,
        signer: ethers.Signer,
        contractAddress: string,
        data: string,
        marginAccountAddress: string,
        assetsDeposit: Record<string, { amount: BigNumber; decimal: number }>,
    ): Promise<{ gasLimit: BigNumber; data: string }> {
        const address = await signer.getAddress();

        if (!provider) {
            throw new Error('Signer must be connected to a provider to estimate gas.');
        }

        const from = await signer.getAddress();
        const stateOverrides = {
            // Set sender balance to max to avoid balance issues
            [address]: {
                balance: PADDED_AMOUNT,
            },
            [marginAccountAddress]: {
                stateDiff: {},
            },
        };
        let value = ethers.BigNumber.from(0);
        // Build stateDiff for margin account with all token balances
        for (const [tokenAddress] of Object.entries(assetsDeposit)) {
            if (tokenAddress === ethers.constants.AddressZero) {
                value = assetsDeposit[tokenAddress].amount;
            }
            const balanceSlot = computeBalanceSlotForMarginAccount(address, tokenAddress);
            stateOverrides[marginAccountAddress].stateDiff = {
                ...stateOverrides[marginAccountAddress].stateDiff,
                [balanceSlot]: PADDED_AMOUNT,
            };
        }

        const estimatedGasHex = await provider.send('eth_estimateGas', [
            {
                from,
                to: contractAddress,
                data,
                value: value.toHexString(),
            },
            'latest',
            stateOverrides,
        ]);
        const estimatedGas = BigNumber.from(estimatedGasHex);
        const bufferedGas = estimatedGas.mul(120).div(100);
        // console.log('estimated gas limit', bufferedGas);

        return { gasLimit: bufferedGas, data };
    }
}
