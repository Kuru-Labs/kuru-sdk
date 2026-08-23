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

export enum RewardStatus {
    UNCLAIMED = 0,
    CLAIMED = 1,
    INVALIDATED = 2,
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
     * Claim a single reward
     * @param claimContractAddress The address of the claim contract
     * @param reward The reward to claim
     * @param signature The reward signer's EIP-712 signature
     * @param signer The signer submitting the transaction
     * @returns The transaction receipt
     */
    static async claimReward(
        claimContractAddress: string,
        reward: Reward,
        signature: string,
        signer: ethers.Signer,
    ): Promise<ContractReceipt> {
        const rewardVaultContract = new ethers.Contract(claimContractAddress, rewardVaultAbi.abi, signer);
        const tx = await rewardVaultContract.verifyAndClaimReward(reward, signature);
        return tx.wait();
    }

    /**
     * Construct a transaction to claim a single reward
     * @param claimContractAddress The address of the claim contract
     * @param reward The reward to claim
     * @param signature The reward signer's EIP-712 signature
     * @param signer The signer submitting the transaction
     * @param txOptions Optional transaction overrides
     * @returns The transaction request
     */
    static async constructClaimRewardTransaction(
        claimContractAddress: string,
        reward: Reward,
        signature: string,
        signer: ethers.Signer,
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();
        const rewardVaultInterface = new ethers.utils.Interface(rewardVaultAbi.abi);
        const data = rewardVaultInterface.encodeFunctionData('verifyAndClaimReward', [reward, signature]);

        return buildTransactionRequest({
            to: claimContractAddress,
            from: address,
            data,
            txOptions,
            signer,
        });
    }

    /**
     * Claim multiple rewards
     * @param claimContractAddress The address of the claim contract
     * @param rewards The rewards to claim
     * @param signatures The signatures of the rewards
     * @param signer The signer to use for the transaction
     * @returns The transaction receipt
     */
    static async claimMultipleRewards(
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
    static async constructClaimMultipleRewardsTransaction(
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
    static async signReward(
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
    static async signRewards(
        rewards: Reward[],
        contractAddress: string,
        chainId: number,
        signer: ethers.Signer,
    ): Promise<string[]> {
        const signatures: string[] = [];

        for (const reward of rewards) {
            const signature = await this.signReward(reward, contractAddress, chainId, signer);
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
    static async getNonce(
        contractAddress: string,
        recipient: string,
        provider: ethers.providers.Provider,
    ): Promise<string> {
        const rewardVaultContract = new ethers.Contract(contractAddress, rewardVaultAbi.abi, provider);
        const nonce = await rewardVaultContract.getNonce(recipient);
        return nonce.toString();
    }

    /**
     * Check whether a specific reward has been claimed
     * @param contractAddress The RewardVault contract address
     * @param recipient The reward recipient
     * @param nonce The reward identifier; it does not need to be claimed sequentially
     * @param provider The provider to use for the call
     */
    static async hasClaimed(
        contractAddress: string,
        recipient: string,
        nonce: string,
        provider: ethers.providers.Provider,
    ): Promise<boolean> {
        const rewardVaultContract = new ethers.Contract(contractAddress, rewardVaultAbi.abi, provider);
        return rewardVaultContract.hasClaimed(recipient, nonce);
    }

    /**
     * Get the status of a specific reward
     * @param contractAddress The RewardVault contract address
     * @param recipient The reward recipient
     * @param nonce The reward identifier
     * @param provider The provider to use for the call
     */
    static async getRewardStatus(
        contractAddress: string,
        recipient: string,
        nonce: string,
        provider: ethers.providers.Provider,
    ): Promise<RewardStatus> {
        const rewardVaultContract = new ethers.Contract(contractAddress, rewardVaultAbi.abi, provider);
        const status = await rewardVaultContract.getRewardStatus(recipient, nonce);
        return ethers.BigNumber.from(status).toNumber() as RewardStatus;
    }

    /**
     * Check whether a specific reward has been invalidated
     * @param contractAddress The RewardVault contract address
     * @param recipient The reward recipient
     * @param nonce The reward identifier
     * @param provider The provider to use for the call
     */
    static async isRewardInvalidated(
        contractAddress: string,
        recipient: string,
        nonce: string,
        provider: ethers.providers.Provider,
    ): Promise<boolean> {
        const rewardVaultContract = new ethers.Contract(contractAddress, rewardVaultAbi.abi, provider);
        return rewardVaultContract.isRewardInvalidated(recipient, nonce);
    }
}
