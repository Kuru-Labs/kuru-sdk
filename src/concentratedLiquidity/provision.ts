import { ethers, ContractReceipt, BigNumber } from 'ethers';
import { BatchLPDetails } from './positionViewer';
import { TransactionOptions } from '../types';
import orderbookAbi from '../../abi/OrderBook.json';
import buildTransactionRequest from '../utils/txConfig';

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
        const { prices, flipPrices, sizes, isBuy } = PositionProvider.buildBatchInputs(batchDetails);

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
        signer: ethers.Signer,
        contractAddress: string,
        batchDetails: BatchLPDetails,
        marginAccountAddress: string,
        assetsDeposit: Record<string, { amount: BigNumber; decimal: number }>,
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();

        const { gasLimit, data } = await PositionProvider.estimateGas(
            signer,
            contractAddress,
            batchDetails,
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

    static computeAccountKey(owner: string, token: string): string {
        return ethers.utils.keccak256(ethers.utils.solidityPack(['address', 'address'], [owner, token]));
    }

    static computeBalanceSlot(owner: string, token: string): string {
        const accountKey = this.computeAccountKey(owner, token);
        const slotBytes = ethers.utils.hexZeroPad(ethers.utils.hexlify(ethers.constants.One), 32);
        return ethers.utils.keccak256(
            ethers.utils.concat([ethers.utils.arrayify(accountKey), ethers.utils.arrayify(slotBytes)]),
        );
    }

    static async estimateGas(
        signer: ethers.Signer,
        contractAddress: string,
        batchDetails: BatchLPDetails,
        marginAccountAddress: string,
        assetsDeposit: Record<string, { amount: BigNumber; decimal: number }>,
    ): Promise<{ gasLimit: BigNumber; data: string }> {
        const provider = signer.provider as ethers.providers.JsonRpcProvider | undefined;

        if (!provider) {
            throw new Error('Signer must be connected to a provider to estimate gas.');
        }

        const from = await signer.getAddress();
        const { prices, flipPrices, sizes, isBuy } = PositionProvider.buildBatchInputs(batchDetails);

        const orderbookInterface = new ethers.utils.Interface(orderbookAbi.abi);
        const data = orderbookInterface.encodeFunctionData('batchProvisionLiquidity', [
            prices,
            flipPrices,
            sizes,
            isBuy,
            false,
        ]);

        const stateOverrides: Record<string, { storage: Record<string, string> }> = {};

        for (const [tokenAddress, { amount }] of Object.entries(assetsDeposit)) {
            if (tokenAddress === ethers.constants.AddressZero) {
                continue;
            }
            const balanceSlot = PositionProvider.computeBalanceSlot(marginAccountAddress, tokenAddress);
            const paddedAmount = ethers.utils.hexZeroPad(amount.toHexString(), 32);

            stateOverrides[tokenAddress] = {
                storage: {
                    ...(stateOverrides[tokenAddress]?.storage ?? {}),
                    [balanceSlot]: paddedAmount,
                },
            };
        }

        if (Object.keys(stateOverrides).length === 0) {
            throw new Error('assetsDeposit must contain at least one token to estimate gas with overrides.');
        }

        const estimatedGasHex = await provider.send('eth_estimateGas', [
            {
                from,
                to: contractAddress,
                data,
            },
            'latest',
            stateOverrides,
        ]);
        const estimatedGas = BigNumber.from(estimatedGasHex);
        const bufferedGas = estimatedGas.mul(120).div(100);
        console.log('estimated gas limit', bufferedGas);

        return { gasLimit: bufferedGas, data };
    }

    private static buildBatchInputs(batchDetails: BatchLPDetails) {
        const prices: bigint[] = [];
        const flipPrices: bigint[] = [];
        const sizes: bigint[] = [];
        const isBuy: boolean[] = [];

        for (const bid of batchDetails.bids) {
            prices.push(bid.price);
            flipPrices.push(bid.flipPrice);
            sizes.push(bid.liquidity);
            isBuy.push(true);
        }

        for (const ask of batchDetails.asks) {
            prices.push(ask.price);
            flipPrices.push(ask.flipPrice);
            sizes.push(ask.liquidity);
            isBuy.push(false);
        }

        return { prices, flipPrices, sizes, isBuy };
    }
}
