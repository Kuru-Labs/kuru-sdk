import { ethers } from 'ethers';
import { RewardVault, Reward, RewardType } from '../../src/vault/rewards';
import * as KuruConfig from '../config.json';

/**
 * Example: Claim rewards with signatures
 * This example demonstrates how users can claim rewards that have been signed
 */
async function main() {
    // ============ Configuration ============
    const { rpcUrl, rewardVaultAddress, userAddress, signedReward } = KuruConfig;
    const PK = process.env.PK as string;

    // ============ Setup Provider and Signer ============
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const userWallet = new ethers.Wallet(PK, provider);

    console.log('User Address:', userAddress);
    console.log('Contract Address:', rewardVaultAddress);

    // This reward and signature would normally come from the claims API. The
    // nonce is a unique reward identifier; an epoch ID can be used when each
    // recipient receives at most one reward per epoch.
    const reward: Reward = {
        recipient: userAddress,
        rewardType: RewardType.NATIVE_OR_ERC20,
        token: ethers.constants.AddressZero,
        amount: ethers.utils.parseEther('1.0').toString(),
        nonce: '12',
    };

    const alreadyClaimed = await RewardVault.hasClaimed(rewardVaultAddress, userAddress, reward.nonce, provider);
    if (alreadyClaimed) {
        console.log('Reward has already been claimed.');
        return;
    }

    // ============ Check Current Balance ============
    console.log('\n========== Before Claim ==========');
    const balanceBefore = await provider.getBalance(userWallet.address);
    console.log('ETH Balance:', ethers.utils.formatEther(balanceBefore));

    // ============ Claim Rewards ============
    console.log('\n========== Claiming Rewards ==========');
    console.log(`Claiming reward ${reward.nonce}...`);

    try {
        const receipt = await RewardVault.claimReward(rewardVaultAddress, reward, signedReward, userWallet);

        console.log('\n✅ Rewards claimed successfully!');
        console.log('Transaction Hash:', receipt.transactionHash);
        console.log('Gas Used:', receipt.gasUsed.toString());
        console.log('Block Number:', receipt.blockNumber);

        // Parse events
        if (receipt.events) {
            console.log('\n========== Events ==========');
            receipt.events.forEach((event, index) => {
                if (event.event === 'RewardClaimed') {
                    console.log(`\nReward ${index + 1} Claimed:`);
                    console.log('  Recipient:', event.args?.recipient);
                    console.log('  Nonce:', event.args?.nonce.toString());
                    console.log('  Token:', event.args?.token);
                    console.log('  Amount:', event.args?.amount.toString());
                }
            });
        }

        // ============ Check Balance After ============
        console.log('\n========== After Claim ==========');
        const balanceAfter = await provider.getBalance(userWallet.address);
        console.log('ETH Balance:', ethers.utils.formatEther(balanceAfter));
        const diff = balanceAfter.sub(balanceBefore);
        console.log('Difference (minus gas):', ethers.utils.formatEther(diff));
    } catch (error: any) {
        console.error('\n❌ Error claiming rewards:', error.message);

        // Common errors
        if (error.message.includes('SignatureMismatch')) {
            console.error('The signature is invalid or does not match the reward data.');
        } else if (error.message.includes('Unauthorized')) {
            console.error('The signature was not created by the authorized reward signer.');
        } else if (error.message.includes('RewardAlreadyClaimed')) {
            console.error('This reward has already been claimed.');
        } else if (error.message.includes('RewardIsInvalidated')) {
            console.error('This reward has been invalidated.');
        }

        throw error;
    }
}

// Run the example
main()
    .then(() => {
        console.log('\n✅ Example completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error);
        process.exit(1);
    });
