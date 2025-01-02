// ============ External Imports ============
import { ethers } from "ethers";

// Add TransactionOptions type import
import { TransactionOptions } from "../types";

// ============ Internal Imports ============
import { extractErrorMessage } from "../utils";
import erc20Abi from "../../abi/IERC20.json";
import { getSigner } from "./signer";

const getOwnerAddress = async (providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner): Promise<string> => {
    const signer = await getSigner(providerOrSigner);
    return await signer.getAddress();
}

/**
 * @dev Constructs a transaction to approve token spending.
 * @param signer - The signer instance.
 * @param tokenContractAddress - The token contract address.
 * @param approveTo - EOA/Contract address of spender.
 * @param size - The amount of tokens to approve.
 * @param txOptions - Optional transaction parameters.
 * @returns A promise that resolves to the transaction request object.
 */
export async function constructApproveTransaction(
    signer: ethers.Signer,
    tokenContractAddress: string,
    approveTo: string,
    size: bigint,
    txOptions?: TransactionOptions
): Promise<ethers.TransactionRequest> {
    const address = await signer.getAddress();
    const tokenInterface = new ethers.Interface(erc20Abi.abi);
    const data = tokenInterface.encodeFunctionData("approve", [approveTo, size]);

    const tx: ethers.TransactionRequest = {
        to: tokenContractAddress,
        from: address,
        data,
        gasLimit: BigInt(50000),
        ...(txOptions?.nonce !== undefined && { nonce: txOptions.nonce }),
        ...(txOptions?.gasPrice && { gasPrice: txOptions.gasPrice }),
        ...(txOptions?.maxFeePerGas && { maxFeePerGas: txOptions.maxFeePerGas }),
        ...(txOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: txOptions.maxPriorityFeePerGas })
    } as ethers.TransactionRequest;

    const baseGasPrice = (!tx.gasPrice && !tx.maxFeePerGas) 
        ? (await signer.provider?.getFeeData())!.gasPrice || undefined
        : undefined;

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
    size: bigint,
    providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
    txOptions?: TransactionOptions,
    waitForReceipt: boolean = true
): Promise<string | null> {
    try {
        const ownerAddress = await getOwnerAddress(providerOrSigner);
        const existingApproval = await tokenContract.allowance(ownerAddress, approveTo);

        if (existingApproval >= size) {
            console.log("Approval already exists");
            return null;
        }

        const signer = await getSigner(tokenContract);

        const tx = await constructApproveTransaction(
            signer,
            tokenContract.target as string,
            approveTo,
            size,
            txOptions
        );
        const transaction = await signer.sendTransaction(tx);
        
        if (!waitForReceipt) {
            return transaction.hash;
        }

        const receipt = await transaction.wait(1);
        return receipt?.hash || null;
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
    size: bigint
): Promise<bigint> {
    try {
        const gasEstimate = await tokenContract.approve.estimateGas(
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
