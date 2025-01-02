import { ethers } from "ethers";
import { TransactionOptions } from "../types";

/**
 * Builds a transaction object with gas estimation and pricing
 * @param signer The signer to use for the transaction
 * @param to The target contract address
 * @param data The encoded function data
 * @param txOptions Optional transaction parameters
 * @returns Promise<ethers.TransactionRequest>
 */
export async function buildTransaction(
    signer: ethers.Signer,
    to: string,
    data: string,
    value?: bigint,
    txOptions?: TransactionOptions
): Promise<ethers.TransactionRequest> {
    const from = await signer.getAddress();

    const tx: ethers.TransactionRequest = {
        to,
        from,
        data,
        value,
        ...(txOptions?.nonce !== undefined && { nonce: txOptions.nonce }),
        ...(txOptions?.gasLimit && { gasLimit: txOptions.gasLimit }),
        ...(txOptions?.gasPrice && { gasPrice: txOptions.gasPrice }),
        ...(txOptions?.maxFeePerGas && { maxFeePerGas: txOptions.maxFeePerGas }),
        ...(txOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: txOptions.maxPriorityFeePerGas })
    } as ethers.TransactionRequest;

    const [gasLimit, baseGasPrice] = await Promise.all([
        !tx.gasLimit ? signer.estimateGas({
            ...tx,
            gasPrice: ethers.parseUnits('1', 'gwei')
        }) : Promise.resolve(tx.gasLimit),
        (!tx.gasPrice && !tx.maxFeePerGas) ? (await signer.provider!.getFeeData()).gasPrice : Promise.resolve(undefined)
    ]);

    if (!tx.gasLimit) {
        tx.gasLimit = gasLimit;
    }

    if (!tx.gasPrice && !tx.maxFeePerGas && baseGasPrice) {
        if (txOptions?.priorityFee) {
            const priorityFeeWei = ethers.parseUnits(
                txOptions.priorityFee.toString(),
                'gwei'
            );
            tx.gasPrice = baseGasPrice + priorityFeeWei;
        } else {
            tx.gasPrice = baseGasPrice;
        }
    }

    return tx;
}