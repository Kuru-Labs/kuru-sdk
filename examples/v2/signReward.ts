import { ethers } from 'ethers';
import { RewardVault, RewardType, Reward } from '../../src/vault/rewards';
import * as KuruConfig from '../config.json';

/**
 * Example: Sign a reward using EIP-712
 * This example demonstrates how to sign rewards that can be claimed by users
 */
async function main() {
    const { rpcUrl, rewardVaultAddress, chainId, userAddress } = KuruConfig;
    // ============ Configuration ============
    const PK = process.env.PK as string;

    // ============ Setup Provider and Signer ============
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const rewardSignerWallet = new ethers.Wallet(PK, provider);

    console.log('Reward Signer Address:', rewardSignerWallet.address);
    console.log('Contract Address:', rewardVaultAddress);
    console.log('Chain ID:', chainId);

    // ============ Example 1: Sign a Single Reward ============
    console.log('\n========== Example 1: Sign a Single Reward ==========');

    const recipientAddress = userAddress;

    // Get the current nonce for the recipient
    const currentNonce = await RewardVault.GetNonce(rewardVaultAddress, recipientAddress, provider);
    console.log('Current Nonce:', currentNonce);

    // Next nonce should be currentNonce + 1
    const nextNonce = (BigInt(currentNonce) + BigInt(1)).toString();
    console.log('Next Nonce:', nextNonce);

    // Create a reward for native token (ETH)
    const nativeReward: Reward = {
        recipient: recipientAddress,
        rewardType: RewardType.NATIVE_OR_ERC20,
        token: ethers.constants.AddressZero, // address(0) for native token
        amount: ethers.utils.parseEther('1.0').toString(), // 1 ETH
        nonce: nextNonce,
    };

    console.log('\nReward Details:');
    console.log('  Recipient:', nativeReward.recipient);
    console.log('  Type:', RewardType[nativeReward.rewardType]);
    console.log('  Token:', nativeReward.token);
    console.log('  Amount:', ethers.utils.formatEther(nativeReward.amount), 'ETH');
    console.log('  Nonce:', nativeReward.nonce);

    // Sign the reward
    const signature = await RewardVault.SignReward(nativeReward, rewardVaultAddress, chainId, rewardSignerWallet);

    console.log('\nSignature:', signature);

    // Output the signed reward in a format ready for claiming
    console.log('\n========== Signed Reward (for config.json) ==========');
    const signedRewardOutput = {
        reward: nativeReward,
        signature: signature,
    };
    console.log(JSON.stringify(signedRewardOutput, null, 2));
    console.log('\nAdd the signature to config.json as "signedReward"');
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
