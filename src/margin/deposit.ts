// ============ External Imports ============
import { BigNumber, ContractReceipt, ethers } from "ethers";

// ============ Internal Imports ============
import {
    extractErrorMessage,
    approveToken,
    estimateApproveGas,
} from "../utils";
import { TransactionOptions } from "src/types";

// ============ Config Imports ============
import erc20Abi from "../../abi/IERC20.json";
import marginAccountAbi from "../../abi/MarginAccount.json";

export abstract class MarginDeposit {
    static async deposit(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        marginAccountAddress: string,
        userAddress: string,
        tokenAddress: string,
        amount: BigNumber,
        approveTokens: boolean,
        txOptions?: TransactionOptions
    ): Promise<ContractReceipt> {
        try {
            const tokenContract = new ethers.Contract(
                tokenAddress,
                erc20Abi.abi,
                providerOrSigner
            );

            if (
                approveTokens &&
                tokenAddress !== ethers.constants.AddressZero
            ) {
                await approveToken(
                    tokenContract,
                    marginAccountAddress,
                    amount,
                    providerOrSigner
                );
            }
            const tx = await MarginDeposit.constructDepositTransaction(
                tokenContract.signer,
                marginAccountAddress,
                userAddress,
                tokenAddress,
                amount,
                txOptions
            );

            const signer =
                providerOrSigner instanceof ethers.Signer
                    ? providerOrSigner
                    : providerOrSigner.getSigner();
            const transaction = await signer.sendTransaction(tx);
            return await transaction.wait();
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
        amount: BigNumber,
        txOptions?: TransactionOptions
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();
        const marginAccountInterface = new ethers.utils.Interface(
            marginAccountAbi.abi
        );

        const data = marginAccountInterface.encodeFunctionData("deposit", [
            userAddress,
            tokenAddress,
            amount,
        ]);

        const tx: ethers.providers.TransactionRequest = {
            to: marginAccountAddress,
            from: address,
            data,
            value:
                tokenAddress === ethers.constants.AddressZero
                    ? amount
                    : BigNumber.from(0),
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
                      gasPrice: ethers.utils.parseUnits("1", "gwei"),
                  })
                : Promise.resolve(tx.gasLimit),
            !tx.gasPrice && !tx.maxFeePerGas
                ? signer.provider!.getGasPrice()
                : Promise.resolve(undefined),
        ]);

        if (!tx.gasLimit) {
            tx.gasLimit = gasLimit;
        }

        if (!tx.gasPrice && !tx.maxFeePerGas && baseGasPrice) {
            if (txOptions?.priorityFee) {
                const priorityFeeWei = ethers.utils.parseUnits(
                    txOptions.priorityFee.toString(),
                    "gwei"
                );
                tx.gasPrice = baseGasPrice.add(priorityFeeWei);
            } else {
                tx.gasPrice = baseGasPrice;
            }
        }

        return tx;
    }

    static async estimateGas(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        marginAccountAddress: string,
        userAddress: string,
        tokenAddress: string,
        amount: BigNumber,
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

            let gasEstimate: BigNumber;
            if (tokenAddress === ethers.constants.AddressZero) {
                gasEstimate = await marginAccount.estimateGas.deposit(
                    userAddress,
                    tokenAddress,
                    amount,
                    { value: amount }
                );
            } else {
                if (approveTokens) {
                    gasEstimate = await estimateApproveGas(
                        tokenContract,
                        marginAccountAddress,
                        amount
                    );
                } else {
                    gasEstimate = await marginAccount.estimateGas.deposit(
                        userAddress,
                        tokenAddress,
                        amount
                    );
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
