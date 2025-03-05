// ============ External Imports ============
import { ethers, BigNumber } from "ethers";

// Add TransactionOptions type import
import { TransactionOptions } from "../types";

// ============ Internal Imports ============
import { extractErrorMessage } from "../utils";
import erc20Abi from "../../abi/IERC20.json";
import { contructTxGasData } from "src/utils/transaction";
const getOwnerAddress = async (
    providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer
): Promise<string> => {
    if (providerOrSigner instanceof ethers.providers.JsonRpcProvider) {
        return await providerOrSigner.getSigner().getAddress();
    }

    return await providerOrSigner.getAddress();
};

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
    size: BigNumber,
    txOptions?: TransactionOptions
): Promise<ethers.providers.TransactionRequest> {
    const address = await signer.getAddress();
    const tokenInterface = new ethers.utils.Interface(erc20Abi.abi);
    const data = tokenInterface.encodeFunctionData("approve", [
        approveTo,
        size,
    ]);

    return contructTxGasData(signer, tokenContractAddress, address, data, txOptions);
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
        const existingApproval = await tokenContract.allowance(
            ownerAddress,
            approveTo
        );

        if (existingApproval.gte(size)) {
            console.log("Approval already exists");
            return null;
        }

        const tx = await constructApproveTransaction(
            tokenContract.signer,
            tokenContract.address,
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
        console.error({ e });
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

/**
 * @dev Gets the token allowance for a specific owner and spender.
 * @param tokenAddress - The token contract address.
 * @param ownerAddress - The address of the token owner.
 * @param spenderAddress - The address of the spender.
 * @param provider - The provider instance to use for the query.
 * @returns A promise that resolves to the current allowance as a BigNumber.
 */
export async function getAllowance(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    provider: ethers.providers.Provider
): Promise<BigNumber> {
    try {
        const tokenContract = new ethers.Contract(
            tokenAddress,
            erc20Abi.abi,
            provider
        );
        const allowance = await tokenContract.allowance(
            ownerAddress,
            spenderAddress
        );
        return allowance;
    } catch (e: any) {
        if (!e.error) {
            throw e;
        }
        throw extractErrorMessage(e);
    }
}
