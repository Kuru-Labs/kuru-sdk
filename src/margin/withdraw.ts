// ============ External Imports ============
import { ContractReceipt, ethers } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage } from "../utils";

// ============ Config Imports ============
import marginAccountAbi from "../../abi/MarginAccount.json";
import { TransactionOptions } from "src/types";
import { constructTxGasData } from "src/utils/transaction";
export abstract class MarginWithdraw {
    static async withdraw(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        marginAccountAddress: string,
        tokenAddress: string,
        amount: number,
        decimals: number,
        txOptions?: TransactionOptions
    ): Promise<ContractReceipt> {
        try {
            const signer = providerOrSigner instanceof ethers.Signer 
                ? providerOrSigner 
                : providerOrSigner.getSigner();

            const formattedAmount = ethers.utils.parseUnits(amount.toString(), decimals);

            const tx = await MarginWithdraw.constructWithdrawTransaction(
                signer,
                marginAccountAddress,
                tokenAddress,
                formattedAmount.toString(),
                txOptions
            );

            const transaction = await signer.sendTransaction(tx);
            return await transaction.wait();
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }

    static async constructWithdrawTransaction(
        signer: ethers.Signer,
        marginAccountAddress: string,
        tokenAddress: string,
        amount: string,
        txOptions?: TransactionOptions
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();
        const marginAccountInterface = new ethers.utils.Interface(marginAccountAbi.abi);

        const data = marginAccountInterface.encodeFunctionData("withdraw", [
            amount,
            tokenAddress
        ]);

        return constructTxGasData(signer, marginAccountAddress, address, data, txOptions);
    }

    static async batchClaimMaxTokens(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        marginAccountAddress: string,
        tokens: string[],
        txOptions?: TransactionOptions
    ): Promise<ContractReceipt> {
        const signer = providerOrSigner instanceof ethers.Signer 
            ? providerOrSigner 
            : providerOrSigner.getSigner();

        const tx = await MarginWithdraw.constructBatchClaimMaxTokensTransaction(
            signer,
            marginAccountAddress,
            tokens,
            txOptions
        );

        const transaction = await signer.sendTransaction(tx);
        return await transaction.wait();
    }

    static async constructBatchClaimMaxTokensTransaction(
        signer: ethers.Signer,
        marginAccountAddress: string,
        tokens: string[],
        txOptions?: TransactionOptions
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();
        const marginAccountInterface = new ethers.utils.Interface(marginAccountAbi.abi);

        const data = marginAccountInterface.encodeFunctionData("batchClaimMaxTokens", [tokens]);

        return constructTxGasData(signer, marginAccountAddress, address, data, txOptions);
    }

}
