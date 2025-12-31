/**
 * Example: Deposit to Active Vault
 * 
 * Usage: PRIVATE_KEY=<your-private-key> ts-node examples/v2/depositActiveVault.ts <base-amount>
 * Example: PRIVATE_KEY=0x123... ts-node examples/v2/depositActiveVault.ts 0.1
 * 
 * This will:
 * 1. Calculate the required quote token amount based on your base token input
 * 2. Approve necessary tokens to the vault
 * 3. Execute the deposit
 * 4. Return the total minted shares
 * 5. Print before/after base and quote token balances
 */

import { ethers } from 'ethers';

import * as KuruSdk from '../../src';
import * as KuruConfig from './../config.json';

const { rpcUrl, vaultAddress } = KuruConfig;


(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    try {
        console.log('=== Active Vault Deposit ===\n');
        
        // Get vault context to fetch token information
        const vaultContext = await KuruSdk.ActiveVault.getVaultContext(vaultAddress, provider);
        const userAddress = "0x98C2F3aF7b65a8388856b13De09b19069A3b17c4";

        // Get final share balance
        const shareBalance = await KuruSdk.ActiveVault.getShareBalance(
            vaultAddress,
            userAddress,
            provider
        );
        console.log('Your total vault shares:', ethers.utils.formatUnits(shareBalance, 18));
        const {baseAmount, quoteAmount} = await KuruSdk.ActiveVault.previewWithdraw(
            shareBalance,
            vaultAddress,
            provider
        );
        console.log('');
        console.log('Expected base amount:', ethers.utils.formatUnits(baseAmount, vaultContext.baseDecimals));
        console.log('Expected quote amount:', ethers.utils.formatUnits(quoteAmount, vaultContext.quoteDecimals));
        console.log('');
    } catch (error) {
        console.error('Error depositing to active vault:', error);
    }
})();
