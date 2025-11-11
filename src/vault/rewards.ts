// ============ External Imports ============
import { ContractReceipt, ethers } from 'ethers';

// ============ Internal Imports ============
import rewardVaultAbi from '../../abi/RewardVault.json';
import { buildTransactionRequest } from 'src/utils';
import { TransactionOptions } from 'src/types';

export enum RewardType {
    NATIVE_OR_ERC20 = 0,
    ERC721 = 1,
    ERC1155 = 2,
}

export interface Reward {
    recipient: string;
    rewardType: RewardType;
    token: string;
    amount: string;
    nonce: string;
}

export class RewardVault {
    static async ClaimMultipleRewards(
        claimContractAddress: string,
        rewards: Reward[],
        signatures: string[],
        signer: ethers.Signer,
    ): Promise<ContractReceipt> {
        const rewardVaultContract = new ethers.Contract(claimContractAddress, rewardVaultAbi.abi, signer);
        const tx = await rewardVaultContract.claimMultipleRewards(rewards, signatures);
        return tx.wait();
    }

    static async ConstructClaimMultipleRewardsTransaction(
        claimContractAddress: string,
        rewards: Reward[],
        signatures: string[],
        signer: ethers.Signer,
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();

        const rewardVaultInterface = new ethers.utils.Interface(rewardVaultAbi.abi);
        const data = rewardVaultInterface.encodeFunctionData('claimMultipleRewards', [rewards, signatures]);

        return buildTransactionRequest({
            to: claimContractAddress,
            from: address,
            data,
            txOptions,
            signer,
        });
    }
}
