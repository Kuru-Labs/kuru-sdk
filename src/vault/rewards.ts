// ============ External Imports ============
import { ContractReceipt, ethers } from 'ethers';

// ============ Internal Imports ============
import rewardVaultAbi from '../../abi/RewardVault.json';
import { buildTransactionRequest } from '../utils';
import { TransactionOptions } from '../types';

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
    /**
     * Claim multiple rewards
     * @param claimContractAddress The address of the claim contract
     * @param rewards The rewards to claim
     * @param signatures The signatures of the rewards
     * @param signer The signer to use for the transaction
     * @returns The transaction receipt
     */
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

    /**
     * Construct a transaction to claim multiple rewards
     * @param claimContractAddress The address of the claim contract
     * @param rewards The rewards to claim
     * @param signatures The signatures of the rewards
     * @param signer The signer to use for the transaction
     * @param txOptions The transaction options
     * @returns The transaction request
     */
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

    /**
     * Sign a single reward using EIP-712
     * @param reward The reward to sign
     * @param contractAddress The RewardVault contract address
     * @param chainId The chain ID
     * @param signer The signer (must be the authorized reward signer)
     * @returns The signature as a hex string
     */
    static async SignReward(
        reward: Reward,
        contractAddress: string,
        chainId: number,
        signer: ethers.Signer,
    ): Promise<string> {
        // EIP-712 Domain
        const domain = {
            name: 'KuruRewardVault',
            version: '0.0.1',
            chainId: chainId,
            verifyingContract: contractAddress,
        };

        // EIP-712 Types
        const types = {
            Reward: [
                { name: 'recipient', type: 'address' },
                { name: 'rewardType', type: 'uint8' },
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
            ],
        };

        // Sign the typed data
        // ethers.Signer doesn't have signTypedData, but ethers.Wallet has _signTypedData
        // Some wallets (e.g. MetaMask) may implement signTypedData directly
        // We'll check for signTypedData first, then fallback to _signTypedData
        let signature: string;
        if (typeof (signer as any).signTypedData === 'function') {
            signature = await (signer as any).signTypedData(domain, types, reward);
        } else if (typeof (signer as any)._signTypedData === 'function') {
            signature = await (signer as any)._signTypedData(domain, types, reward);
        } else {
            throw new Error('The signer does not support EIP-712 signing (signTypedData or _signTypedData)');
        }

        return signature;
    }

    /**
     * Sign multiple rewards using EIP-712
     * @param rewards The array of rewards to sign
     * @param contractAddress The RewardVault contract address
     * @param chainId The chain ID
     * @param signer The signer (must be the authorized reward signer)
     * @returns Array of signatures as hex strings
     */
    static async SignRewards(
        rewards: Reward[],
        contractAddress: string,
        chainId: number,
        signer: ethers.Signer,
    ): Promise<string[]> {
        const signatures: string[] = [];

        for (const reward of rewards) {
            const signature = await this.SignReward(reward, contractAddress, chainId, signer);
            signatures.push(signature);
        }

        return signatures;
    }

    /**
     * Get the current nonce for a recipient
     * @param contractAddress The RewardVault contract address
     * @param recipient The recipient address
     * @param provider The provider to use for the call
     * @returns The current nonce
     */
    static async GetNonce(
        contractAddress: string,
        recipient: string,
        provider: ethers.providers.Provider,
    ): Promise<string> {
        const rewardVaultContract = new ethers.Contract(contractAddress, rewardVaultAbi.abi, provider);
        const nonce = await rewardVaultContract.getNonce(recipient);
        return nonce.toString();
    }
}
