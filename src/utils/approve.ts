// ============ External Imports ============
import { ethers, BigNumber } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage } from "../utils";

const getOwnerAddress = async (
    providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer
): Promise<string> => {
    if (providerOrSigner instanceof ethers.providers.JsonRpcProvider) {
        return await providerOrSigner.getSigner().getAddress();
    }

    return await providerOrSigner.getAddress();
};

/**
 * @dev Approves a token for spending by the market contract.
 * @param tokenContract - The token contract instance.
 * @param approveTo - EOA/Contract address of spender.
 * @param size - The amount of tokens to approve.
 * @returns A promise that resolves when the transaction is confirmed.
 */
export async function approveToken(
    tokenContract: ethers.Contract,
    approveTo: string,
    size: BigNumber,
    providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer
): Promise<string | null> {
    try {
        const ownerAddress = await getOwnerAddress(providerOrSigner);

        const existingApproval = await tokenContract.allowance(
            ownerAddress,
            approveTo
        );

        if (existingApproval.gte(size)) {
            return null;
        }

        const tx = await tokenContract.approve(approveTo, size);

        const { transactionHash } = await tx.wait();

        return transactionHash;
    } catch (e: any) {
        console.error({ e });
        if (!e.error) {
            throw e;
        }
        throw extractErrorMessage(e.error.error.body);
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
        throw extractErrorMessage(e.error.error.body);
    }
}
