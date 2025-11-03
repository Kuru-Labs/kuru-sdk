// ============ External Imports ============
import { BigNumber, ContractReceipt, ethers } from 'ethers';

// ============ Internal Imports ============
import { TransactionOptions } from 'src/types';
import { approveToken, estimateApproveGas, extractErrorMessage } from '../utils';

// ============ Config Imports ============
import erc20Abi from '../../abi/IERC20.json';
import marginAccountAbi from '../../abi/MarginAccount.json';
import buildTransactionRequest from '../utils/txConfig';

export abstract class MarginDeposit {
    static async deposit(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        marginAccountAddress: string,
        userAddress: string,
        tokenAddress: string,
        amount: string,
        decimals: number,
        approveTokens: boolean,
        txOptions?: TransactionOptions,
    ): Promise<ContractReceipt> {
        try {
            const tokenContract = new ethers.Contract(tokenAddress, erc20Abi.abi, providerOrSigner);
            const signer = providerOrSigner instanceof ethers.Signer ? providerOrSigner : providerOrSigner.getSigner();

            if (approveTokens && tokenAddress !== ethers.constants.AddressZero) {
                await approveToken(
                    tokenContract,
                    marginAccountAddress,
                    ethers.utils.parseUnits(amount, decimals),
                    providerOrSigner,
                );
            }
            const formattedAmount = ethers.utils.parseUnits(amount, decimals);
            const tx = await MarginDeposit.constructDepositTransaction(
                signer,
                marginAccountAddress,
                userAddress,
                tokenAddress,
                formattedAmount,
                txOptions,
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

    static async constructDepositTransaction(
        signer: ethers.Signer,
        marginAccountAddress: string,
        userAddress: string,
        tokenAddress: string,
        amount: BigNumber,
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();
        const marginAccountInterface = new ethers.utils.Interface(marginAccountAbi.abi);

        const data = marginAccountInterface.encodeFunctionData('deposit', [userAddress, tokenAddress, amount]);

        const value = tokenAddress === ethers.constants.AddressZero ? amount : BigNumber.from(0);

        return buildTransactionRequest({
            to: marginAccountAddress,
            from: address,
            data,
            value,
            txOptions,
            signer,
        });
    }

    static async estimateGas(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        marginAccountAddress: string,
        userAddress: string,
        tokenAddress: string,
        amount: string,
        decimals: number,
        approveTokens: boolean,
    ): Promise<BigNumber> {
        try {
            const tokenContract = new ethers.Contract(tokenAddress, erc20Abi.abi, providerOrSigner);
            const marginAccount = new ethers.Contract(marginAccountAddress, marginAccountAbi.abi, providerOrSigner);

            const formattedAmount = ethers.utils.parseUnits(amount, decimals);

            let gasEstimate: BigNumber;
            if (tokenAddress === ethers.constants.AddressZero) {
                gasEstimate = await marginAccount.estimateGas.deposit(userAddress, tokenAddress, formattedAmount, {
                    value: formattedAmount,
                });
            } else {
                if (approveTokens) {
                    gasEstimate = await estimateApproveGas(
                        tokenContract,
                        marginAccountAddress,
                        ethers.utils.parseUnits(amount, decimals),
                    );
                } else {
                    gasEstimate = await marginAccount.estimateGas.deposit(userAddress, tokenAddress, formattedAmount);
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
