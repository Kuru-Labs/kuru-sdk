import { describe, expect, it, jest } from '@jest/globals';
import { ethers } from 'ethers';
import rewardVaultAbi from '../abi/RewardVault.json';
import { Reward, RewardStatus, RewardType, RewardVault } from '../src/vault/rewards';

const contractAddress = '0x1000000000000000000000000000000000000001';
const recipient = '0x2000000000000000000000000000000000000002';
const signature = `0x${'11'.repeat(65)}`;
const reward: Reward = {
    recipient,
    rewardType: RewardType.NATIVE_OR_ERC20,
    token: ethers.constants.AddressZero,
    amount: '1000000',
    nonce: '12',
};
const rewardVaultInterface = new ethers.utils.Interface(rewardVaultAbi.abi);

describe('RewardVault', () => {
    it('constructs a single reward claim transaction', async () => {
        const signer = {
            _isSigner: true,
            getAddress: jest.fn(async () => recipient),
            estimateGas: jest.fn(async () => ethers.BigNumber.from(100000)),
            provider: {
                getGasPrice: jest.fn(async () => ethers.BigNumber.from(1)),
            },
        } as unknown as ethers.Signer;

        const transaction = await RewardVault.constructClaimRewardTransaction(
            contractAddress,
            reward,
            signature,
            signer,
        );
        const decoded = rewardVaultInterface.decodeFunctionData('verifyAndClaimReward', transaction.data as string);

        expect(transaction.to).toBe(contractAddress);
        expect(transaction.from).toBe(recipient);
        expect(transaction.gasLimit?.toString()).toBe('120000');
        expect(decoded.reward.recipient).toBe(recipient);
        expect(decoded.reward.nonce.toString()).toBe(reward.nonce);
        expect(decoded.signature).toBe(signature);
    });

    it('submits a single reward claim and waits for its receipt', async () => {
        const receipt = { transactionHash: `0x${'22'.repeat(32)}`, logs: [] } as unknown as ethers.ContractReceipt;
        const wait = jest.fn(async () => receipt);
        const sendTransaction = jest.fn(async (_transaction: ethers.providers.TransactionRequest) => ({ wait }));
        const signer = {
            _isSigner: true,
            getAddress: jest.fn(async () => recipient),
            sendTransaction,
            provider: {
                _isProvider: true,
                getNetwork: jest.fn(async () => ({ chainId: 143 })),
                resolveName: jest.fn(async (name: string) => name),
            },
        } as unknown as ethers.Signer;

        const result = await RewardVault.claimReward(contractAddress, reward, signature, signer);
        const submitted = sendTransaction.mock.calls[0][0] as ethers.providers.TransactionRequest;
        const decoded = rewardVaultInterface.decodeFunctionData('verifyAndClaimReward', submitted.data as string);

        expect(result).toBe(receipt);
        expect(wait).toHaveBeenCalledTimes(1);
        expect(decoded.reward.nonce.toString()).toBe(reward.nonce);
    });

    it('reads claim and invalidation status for a specific reward', async () => {
        const call = jest.fn(async (transaction: ethers.providers.TransactionRequest) => {
            const selector = (transaction.data as string).slice(0, 10);
            if (selector === rewardVaultInterface.getSighash('hasClaimed')) {
                return rewardVaultInterface.encodeFunctionResult('hasClaimed', [true]);
            }
            if (selector === rewardVaultInterface.getSighash('getRewardStatus')) {
                return rewardVaultInterface.encodeFunctionResult('getRewardStatus', [RewardStatus.CLAIMED]);
            }
            if (selector === rewardVaultInterface.getSighash('isRewardInvalidated')) {
                return rewardVaultInterface.encodeFunctionResult('isRewardInvalidated', [false]);
            }
            throw new Error(`Unexpected selector: ${selector}`);
        });
        const provider = {
            _isProvider: true,
            call,
            getNetwork: jest.fn(async () => ({ chainId: 143 })),
            resolveName: jest.fn(async (name: string) => name),
        } as unknown as ethers.providers.Provider;

        await expect(RewardVault.hasClaimed(contractAddress, recipient, reward.nonce, provider)).resolves.toBe(true);
        await expect(RewardVault.getRewardStatus(contractAddress, recipient, reward.nonce, provider)).resolves.toBe(
            RewardStatus.CLAIMED,
        );
        await expect(RewardVault.isRewardInvalidated(contractAddress, recipient, reward.nonce, provider)).resolves.toBe(
            false,
        );
        expect(call).toHaveBeenCalledTimes(3);
    });
});
