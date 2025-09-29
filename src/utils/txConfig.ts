import { ethers } from 'ethers';
import { TransactionOptions } from '../types';

export default async function buildTransactionRequest({
    from,
    to,
    signer,
    data,
    value,
    txOptions,
}: {
    from: string;
    to: string;
    signer: ethers.Signer;
    data: string;
    value?: ethers.BigNumber;
    txOptions?: TransactionOptions;
}) {
    const tx: ethers.providers.TransactionRequest = {
        to,
        from,
        data,
        value,
        ...(txOptions?.nonce !== undefined && { nonce: txOptions.nonce }),
        ...(txOptions?.gasLimit && { gasLimit: txOptions.gasLimit }),
        ...(txOptions?.gasPrice && { gasPrice: txOptions.gasPrice }),
        ...(txOptions?.maxFeePerGas && {
            maxFeePerGas: txOptions.maxFeePerGas,
        }),
        ...(txOptions?.maxPriorityFeePerGas && {
            maxPriorityFeePerGas: txOptions.maxPriorityFeePerGas,
        }),
    };

    const [gasLimit, baseGasPrice] = await Promise.all([
        !tx.gasLimit
            ? signer.estimateGas({
                  ...tx,
                  gasPrice: ethers.utils.parseUnits('1', 'gwei'),
              })
            : Promise.resolve(tx.gasLimit),
        !tx.gasPrice && !tx.maxFeePerGas ? signer.provider!.getGasPrice() : Promise.resolve(undefined),
    ]);

    if (!tx.gasLimit) {
        tx.gasLimit = gasLimit;
    }

    if (!tx.gasPrice && !tx.maxFeePerGas && baseGasPrice) {
        if (txOptions?.priorityFee) {
            const priorityFeeWei = ethers.utils.parseUnits(txOptions.priorityFee.toString(), 'gwei');
            tx.gasPrice = baseGasPrice.add(priorityFeeWei);
        } else {
            tx.gasPrice = baseGasPrice;
        }
    }

    return tx;
}
