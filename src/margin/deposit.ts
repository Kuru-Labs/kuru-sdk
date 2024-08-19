// ============ External Imports ============
import { BigNumber, ContractReceipt, ethers } from "ethers";

// ============ Internal Imports ============
import {
    extractErrorMessage,
    approveToken,
    estimateApproveGas
} from "../utils";

// ============ Config Imports ============
import erc20Abi from "../../abi/IERC20.json";
import marginAccountAbi from "../../abi/MarginAccount.json";

export abstract class MarginDeposit {
    static async deposit(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        marginAccountAddress: string,
        userAddress: string,
        tokenAddress: string,
        amount: number,
        decimals: number,
        approveTokens: boolean
    ): Promise<ContractReceipt> {
        try {
            const tokenContract = new ethers.Contract(
                tokenAddress,
                erc20Abi.abi,
                providerOrSigner
            );
            const marginAccount = new ethers.Contract(
                marginAccountAddress,
                marginAccountAbi.abi,
                providerOrSigner
            );

            const formattedAmount = ethers.utils.parseUnits(
                amount.toString(),
                decimals
            );

            if (tokenAddress === ethers.constants.AddressZero) {
                const tx = await marginAccount.deposit(
                    userAddress,
                    tokenAddress,
                    formattedAmount,
                    { value: formattedAmount }
                );
                return await tx.wait();
            } else {
                if (approveTokens) {
                    await approveToken(
                        tokenContract,
                        marginAccountAddress,
                        ethers.utils.parseUnits(amount.toString(), decimals),
                        providerOrSigner
                    );
                }

                const tx = await marginAccount.deposit(
                    userAddress,
                    tokenAddress,
                    formattedAmount
                );
                return await tx.wait();
            }
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e.error.error.body);
        }
    }

    static async estimateGas(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        marginAccountAddress: string,
        userAddress: string,
        tokenAddress: string,
        amount: number,
        decimals: number,
        approveTokens: boolean
    ): Promise<BigNumber> {
        try {
            const tokenContract = new ethers.Contract(
                tokenAddress,
                erc20Abi.abi,
                providerOrSigner
            );
            const marginAccount = new ethers.Contract(
                marginAccountAddress,
                marginAccountAbi.abi,
                providerOrSigner
            );

            const formattedAmount = ethers.utils.parseUnits(
                amount.toString(),
                decimals
            );

            let gasEstimate: BigNumber;
            if (tokenAddress === ethers.constants.AddressZero) {
                gasEstimate = await marginAccount.estimateGas.deposit(
                    userAddress,
                    tokenAddress,
                    formattedAmount,
                    { value: formattedAmount }
                );
            } else {
                if (approveTokens) {
                    gasEstimate = await estimateApproveGas(
                        tokenContract,
                        marginAccountAddress,
                        ethers.utils.parseUnits(amount.toString(), decimals)
                    );
                } else {
                    gasEstimate = await marginAccount.estimateGas.deposit(
                        userAddress,
                        tokenAddress,
                        formattedAmount
                    );
                }
            }

            return gasEstimate;
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e.error.error.body);
        }
    }
}
