// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage, approveToken, estimateApproveGas } from "../utils";
import { TransactionOptions } from "../types";
import { buildTransaction } from "../utils/transaction";

// ============ Config Imports ============
import erc20Abi from "../../abi/IERC20.json";
import marginAccountAbi from "../../abi/MarginAccount.json";
import { getSigner } from '../utils/signer';

export abstract class MarginDeposit {
    static async deposit(
        providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
        marginAccountAddress: string,
        userAddress: string,
        tokenAddress: string,
        amount: number,
        decimals: number,
        approveTokens: boolean,
        txOptions?: TransactionOptions,
    ): Promise<ethers.TransactionReceipt> {
        try {
            const tokenContract = new ethers.Contract(tokenAddress, erc20Abi.abi, providerOrSigner);
            
            if (approveTokens && tokenAddress !== ethers.ZeroAddress) {
                await approveToken(
                    tokenContract,
                    marginAccountAddress,
                    ethers.parseUnits(amount.toString(), decimals),
                    providerOrSigner
                );
            }

            const signer = await getSigner(providerOrSigner);

            const tx = await MarginDeposit.constructDepositTransaction(
                signer,
                marginAccountAddress,
                userAddress,
                tokenAddress,
                amount,
                decimals,
                txOptions
            );

            const transaction = await signer.sendTransaction(tx);
            const receipt = await transaction.wait();
            if (!receipt) {
                throw new Error("Transaction failed");
            }
            return receipt;
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }

    static async constructDepositTransaction(
        signer: ethers.Signer,
        marginAccountAddress: string,
        userAddress: string,
        tokenAddress: string,
        amount: number,
        decimals: number,
        txOptions?: TransactionOptions
    ): Promise<ethers.TransactionRequest> {

        const marginAccountInterface = new ethers.Interface(marginAccountAbi.abi);

        const formattedAmount = ethers.parseUnits(amount.toString(), decimals);

        const data = marginAccountInterface.encodeFunctionData("deposit", [
            userAddress,
            tokenAddress,
            formattedAmount
        ]);

        return buildTransaction(
            signer,
            marginAccountAddress,
            data,
            tokenAddress === ethers.ZeroAddress ? formattedAmount : BigInt(0),
            txOptions
        );
    }

    static async estimateGas(
        providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
        marginAccountAddress: string,
        userAddress: string,
        tokenAddress: string,
        amount: number,
        decimals: number,
        approveTokens: boolean,
    ): Promise<BigInt> {
        try {
            const tokenContract = new ethers.Contract(tokenAddress, erc20Abi.abi, providerOrSigner);
            const marginAccount = new ethers.Contract(marginAccountAddress, marginAccountAbi.abi, providerOrSigner);
    
            const formattedAmount = ethers.parseUnits(amount.toString(), decimals);
    
            let gasEstimate: BigInt;
            if (tokenAddress === ethers.ZeroAddress) {
                gasEstimate = await marginAccount.deposit.estimateGas(userAddress, tokenAddress, formattedAmount, { value: formattedAmount });
            } else {
                if (approveTokens) {
                    gasEstimate = await estimateApproveGas(
                        tokenContract,
                        marginAccountAddress,
                        ethers.parseUnits(amount.toString(), decimals),
                    );
                } else {
                    gasEstimate = await marginAccount.deposit.estimateGas(userAddress, tokenAddress, formattedAmount);
                }
            }

            return gasEstimate;
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }
}
