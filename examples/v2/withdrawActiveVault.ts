/**
 * Example: Withdraw from Active Vault
 * 
 * Usage: PRIVATE_KEY=<your-private-key> ts-node examples/v2/withdrawActiveVault.ts <percentage>
 * Example: PRIVATE_KEY=0x123... ts-node examples/v2/withdrawActiveVault.ts 50
 * 
 * This will:
 * 1. Get your current share balance
 * 2. Calculate shares to withdraw based on percentage
 * 3. Preview expected token amounts
 * 4. Execute the withdrawal
 * 5. Compare actual vs expected amounts
 */

import { ethers, BigNumber } from 'ethers';

import * as KuruSdk from '../../src';
import * as KuruConfig from './../config.json';
import erc20Abi from '../../abi/IERC20.json';

const { rpcUrl, vaultAddress } = KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

const args = process.argv.slice(2);
const withdrawPercentage = parseFloat(args[0]); // Percentage to withdraw (e.g., 50 for 50%)

if (!withdrawPercentage || withdrawPercentage <= 0 || withdrawPercentage > 100) {
    console.error('Please provide a valid percentage (1-100) to withdraw');
    console.error('Usage: PRIVATE_KEY=<key> ts-node examples/v2/withdrawActiveVault.ts <percentage>');
    process.exit(1);
}

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    const userAddress = await signer.getAddress();

    try {
        console.log('=== Active Vault Withdrawal ===\n');
        
        // Get vault context
        const vaultContext = await KuruSdk.ActiveVault.getVaultContext(vaultAddress, provider);
        console.log('Vault Address:', vaultAddress);
        console.log('Base Token:', vaultContext.base === ethers.constants.AddressZero ? 'ETH (Native)' : vaultContext.base);
        console.log('Quote Token:', vaultContext.quote === ethers.constants.AddressZero ? 'ETH (Native)' : vaultContext.quote);
        console.log('');

        // Get current share balance
        const currentShares = await KuruSdk.ActiveVault.getShareBalance(
            vaultAddress,
            userAddress,
            provider
        );
        
        if (currentShares.isZero()) {
            console.error('You have no shares in this vault to withdraw');
            process.exit(1);
        }

        console.log('Your current shares:', ethers.utils.formatUnits(currentShares, 18));
        
        // Calculate shares to withdraw
        const sharesToWithdraw = currentShares.mul(withdrawPercentage).div(100);
        console.log(`Withdrawing ${withdrawPercentage}% = ${ethers.utils.formatUnits(sharesToWithdraw, 18)} shares`);
        console.log('');

        // Preview withdrawal amounts
        const preview = await KuruSdk.ActiveVault.previewWithdraw(
            sharesToWithdraw,
            vaultAddress,
            provider
        );
        
        console.log('=== Expected Amounts (from preview) ===');
        console.log('Base amount:', ethers.utils.formatUnits(preview.baseAmount, vaultContext.baseDecimals), 
                    vaultContext.base === ethers.constants.AddressZero ? 'ETH' : 'tokens');
        console.log('Quote amount:', ethers.utils.formatUnits(preview.quoteAmount, vaultContext.quoteDecimals), 
                    vaultContext.quote === ethers.constants.AddressZero ? 'ETH' : 'tokens');
        console.log('');

        // Get balances before withdrawal
        let baseBalanceBefore: BigNumber;
        let quoteBalanceBefore: BigNumber;
        
        if (vaultContext.base === ethers.constants.AddressZero) {
            baseBalanceBefore = await provider.getBalance(userAddress);
        } else {
            const baseToken = new ethers.Contract(vaultContext.base, erc20Abi.abi, provider);
            baseBalanceBefore = await baseToken.balanceOf(userAddress);
        }
        
        if (vaultContext.quote === ethers.constants.AddressZero) {
            quoteBalanceBefore = await provider.getBalance(userAddress);
        } else {
            const quoteToken = new ethers.Contract(vaultContext.quote, erc20Abi.abi, provider);
            quoteBalanceBefore = await quoteToken.balanceOf(userAddress);
        }

        // Execute withdrawal
        console.log('Executing withdrawal transaction...');
        const receipt = await KuruSdk.ActiveVault.withdraw(
            sharesToWithdraw,
            vaultAddress,
            signer
        );

        console.log('\n=== Transaction Complete ===');
        console.log('Transaction hash:', receipt.transactionHash);
        console.log('Gas used:', receipt.gasUsed.toString());
        
        // Calculate gas cost
        const gasPrice = receipt.effectiveGasPrice;
        const gasCost = receipt.gasUsed.mul(gasPrice);
        console.log('Gas cost:', ethers.utils.formatEther(gasCost), 'ETH');
        console.log('');

        // Get balances after withdrawal
        let baseBalanceAfter: BigNumber;
        let quoteBalanceAfter: BigNumber;
        
        if (vaultContext.base === ethers.constants.AddressZero) {
            baseBalanceAfter = await provider.getBalance(userAddress);
        } else {
            const baseToken = new ethers.Contract(vaultContext.base, erc20Abi.abi, provider);
            baseBalanceAfter = await baseToken.balanceOf(userAddress);
        }
        
        if (vaultContext.quote === ethers.constants.AddressZero) {
            quoteBalanceAfter = await provider.getBalance(userAddress);
        } else {
            const quoteToken = new ethers.Contract(vaultContext.quote, erc20Abi.abi, provider);
            quoteBalanceAfter = await quoteToken.balanceOf(userAddress);
        }

        // Calculate actual received amounts
        let actualBaseReceived = baseBalanceAfter.sub(baseBalanceBefore);
        let actualQuoteReceived = quoteBalanceAfter.sub(quoteBalanceBefore);
        
        // For native tokens, add back gas cost to get actual received amount
        if (vaultContext.base === ethers.constants.AddressZero) {
            actualBaseReceived = actualBaseReceived.add(gasCost);
        }
        if (vaultContext.quote === ethers.constants.AddressZero) {
            actualQuoteReceived = actualQuoteReceived.add(gasCost);
        }

        console.log('=== Actual Amounts Received ===');
        console.log('Base amount:', ethers.utils.formatUnits(actualBaseReceived, vaultContext.baseDecimals), 
                    vaultContext.base === ethers.constants.AddressZero ? 'ETH' : 'tokens');
        console.log('Quote amount:', ethers.utils.formatUnits(actualQuoteReceived, vaultContext.quoteDecimals), 
                    vaultContext.quote === ethers.constants.AddressZero ? 'ETH' : 'tokens');
        console.log('');

        // Calculate differences
        const baseDiff = actualBaseReceived.sub(preview.baseAmount);
        const quoteDiff = actualQuoteReceived.sub(preview.quoteAmount);
        
        console.log('=== Difference (Actual - Preview) ===');
        console.log('Base difference:', ethers.utils.formatUnits(baseDiff, vaultContext.baseDecimals), 
                    `(${baseDiff.isNegative() ? '-' : '+'}${baseDiff.abs().mul(10000).div(preview.baseAmount.isZero() ? 1 : preview.baseAmount).toNumber() / 100}%)`);
        console.log('Quote difference:', ethers.utils.formatUnits(quoteDiff, vaultContext.quoteDecimals), 
                    `(${quoteDiff.isNegative() ? '-' : '+'}${quoteDiff.abs().mul(10000).div(preview.quoteAmount.isZero() ? 1 : preview.quoteAmount).toNumber() / 100}%)`);
        console.log('');

        // Get final share balance
        const finalShares = await KuruSdk.ActiveVault.getShareBalance(
            vaultAddress,
            userAddress,
            provider
        );
        console.log('Remaining shares:', ethers.utils.formatUnits(finalShares, 18));

    } catch (error) {
        console.error('Error withdrawing from active vault:', error);
    }
})();
