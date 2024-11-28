// ============ External Imports ============
import { ethers, BigNumber } from "ethers";

// Add TransactionOptions type import
import { TransactionOptions } from "../types";

// ============ Internal Imports ============
import { extractErrorMessage } from "../utils";

const getOwnerAddress = async (providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer): Promise<string> => {

    if (providerOrSigner instanceof ethers.providers.JsonRpcProvider) {
        return await providerOrSigner.getSigner().getAddress();
    }

    return await providerOrSigner.getAddress();
}

/**
 * @dev Constructs a transaction to approve token spending.
 * @param tokenContract - The token contract instance.
 * @param approveTo - EOA/Contract address of spender.
 * @param size - The amount of tokens to approve.
 * @param txOptions - Optional transaction parameters.
 * @returns A promise that resolves to the transaction request object.
 */
export async function constructApproveTransaction(
    tokenContract: ethers.Contract,
    approveTo: string,
    size: BigNumber,
    txOptions?: TransactionOptions
): Promise<ethers.providers.TransactionRequest> {
    const signer = tokenContract.signer;
    const address = await signer.getAddress();

    const data = tokenContract.interface.encodeFunctionData("approve", [
        approveTo,
        size
    ]);

    const tx: ethers.providers.TransactionRequest = {
        to: tokenContract.address,
        from: address,
        data,
        gasLimit: BigNumber.from(50000),
        ...(txOptions?.nonce !== undefined && { nonce: txOptions.nonce }),
        ...(txOptions?.gasPrice && { gasPrice: txOptions.gasPrice }),
        ...(txOptions?.maxFeePerGas && { maxFeePerGas: txOptions.maxFeePerGas }),
        ...(txOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: txOptions.maxPriorityFeePerGas })
    };

    const baseGasPrice = (!tx.gasPrice && !tx.maxFeePerGas) 
        ? await signer.provider!.getGasPrice() 
        : undefined;

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
 * @dev Approves a token for spending by the market contract.
 * @param tokenContract - The token contract instance.
 * @param approveTo - EOA/Contract address of spender.
 * @param size - The amount of tokens to approve.
 * @param providerOrSigner - The provider or signer to use for the transaction.
 * @param txOptions - Optional transaction parameters.
 * @param waitForReceipt - Whether to wait for the transaction receipt.
 * @returns A promise that resolves when the transaction is confirmed.
 */
export async function approveToken(
    tokenContract: ethers.Contract,
    approveTo: string,
    size: BigNumber,
    providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    txOptions?: TransactionOptions,
    waitForReceipt: boolean = true
): Promise<string | null> {
    try {
        const ownerAddress = await getOwnerAddress(providerOrSigner);
        const existingApproval = await tokenContract.allowance(ownerAddress, approveTo);

        if (existingApproval.gte(size)) {
            return null;
        }

        const tx = await constructApproveTransaction(
            tokenContract,
            approveTo,
            size,
            txOptions
        );

        const transaction = await tokenContract.signer.sendTransaction(tx);
        
        if (!waitForReceipt) {
            return transaction.hash;
        }

        const receipt = await transaction.wait(1);
        return receipt.transactionHash;
    } catch (e: any) {
        console.error({e});
        if (!e.error) {
            throw e;
        }
        throw extractErrorMessage(e);
    }
}

export async function estimateApproveGas(
    tokenContract: ethers.Contract,
    approveTo: string,
    size: BigNumber
): Promise<BigNumber> {
    try {
        const gasEstimate = await tokenContract.estimateGas.approve(
            approveTo,
            size
        );
        return gasEstimate;
    } catch (e: any) {
        if (!e.error) {
            throw e;
        }
        throw extractErrorMessage(e);
    }
}
