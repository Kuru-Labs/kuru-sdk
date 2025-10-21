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
import { parseUnits } from 'ethers/lib/utils';
import erc20Abi from '../../abi/IERC20.json';

import * as KuruSdk from '../../src';
import * as KuruConfig from './../config.json';

const { rpcUrl, vaultAddress } = KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

const args = process.argv.slice(2);
const baseAmount = args[0]; // Base amount in human-readable format (e.g., "1.5" for 1.5 ETH)

if (!baseAmount) {
    console.error('Please provide base amount as argument');
    console.error('Usage: PRIVATE_KEY=<key> ts-node examples/v2/depositActiveVault.ts <base-amount>');
    process.exit(1);
}

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    try {
        console.log('=== Active Vault Deposit ===\n');
        
        // Get vault context to fetch token information
        const vaultContext = await KuruSdk.ActiveVault.getVaultContext(vaultAddress, provider);
        console.log('Vault Address:', vaultAddress);
        console.log('Base Token:', vaultContext.base === ethers.constants.AddressZero ? 'ETH (Native)' : vaultContext.base);
        console.log('Quote Token:', vaultContext.quote === ethers.constants.AddressZero ? 'ETH (Native)' : vaultContext.quote);
        console.log('');

        // Convert base amount to wei
        const baseAmountWei = parseUnits(baseAmount, vaultContext.baseDecimals);
        console.log(`Base amount: ${baseAmount} (${baseAmountWei.toString()} wei)`);

        // Calculate corresponding quote amount needed
        const quoteAmountWei = await KuruSdk.ActiveVault.calculateQuoteForBase(
            baseAmountWei,
            vaultAddress,
            provider
        );
        const quoteAmountHuman = ethers.utils.formatUnits(quoteAmountWei, vaultContext.quoteDecimals);
        console.log(`Quote amount needed: ${quoteAmountHuman} (${quoteAmountWei.toString()} wei)`);
        console.log('');

        // Preview shares to be minted
        const expectedShares = await KuruSdk.ActiveVault.previewDeposit(
            baseAmountWei,
            quoteAmountWei,
            vaultAddress,
            provider
        );
        console.log('Expected shares to mint:', ethers.utils.formatUnits(expectedShares, 18));
        console.log('');

        // Get user's address
        const userAddress = await signer.getAddress();

        // Prepare base and quote contract instances (if not native)
        let baseBefore: ethers.BigNumber;
        let quoteBefore: ethers.BigNumber;
        // Fetch before balances
        if (vaultContext.base === ethers.constants.AddressZero) {
            baseBefore = await provider.getBalance(userAddress);
        } else {
            const baseToken = new ethers.Contract(vaultContext.base, erc20Abi.abi, provider);
            baseBefore = await baseToken.balanceOf(userAddress);
        }
        if (vaultContext.quote === ethers.constants.AddressZero) {
            quoteBefore = await provider.getBalance(userAddress);
        } else {
            const quoteToken = new ethers.Contract(vaultContext.quote, erc20Abi.abi, provider);
            quoteBefore = await quoteToken.balanceOf(userAddress);
        }

        // Print before balances
        console.log('--- Balances BEFORE deposit ---');
        console.log('Base token:', ethers.utils.formatUnits(baseBefore, vaultContext.baseDecimals));
        console.log('Quote token:', ethers.utils.formatUnits(quoteBefore, vaultContext.quoteDecimals));
        console.log('');

        // Execute deposit (shouldApprove = true to handle token approvals automatically)
        console.log('Executing deposit transaction...');
        const receipt = await KuruSdk.ActiveVault.deposit(
            baseAmountWei,
            quoteAmountWei,
            vaultAddress,
            signer,
            true // shouldApprove
        );

        console.log('\n=== Transaction Complete ===');
        console.log('Transaction hash:', receipt.transactionHash);
        console.log('Gas used:', receipt.gasUsed.toString());

        // Fetch after balances
        let baseAfter: ethers.BigNumber;
        let quoteAfter: ethers.BigNumber;
        if (vaultContext.base === ethers.constants.AddressZero) {
            baseAfter = await provider.getBalance(userAddress);
        } else {
            const baseToken = new ethers.Contract(vaultContext.base, erc20Abi.abi, provider);
            baseAfter = await baseToken.balanceOf(userAddress);
        }
        if (vaultContext.quote === ethers.constants.AddressZero) {
            quoteAfter = await provider.getBalance(userAddress);
        } else {
            const quoteToken = new ethers.Contract(vaultContext.quote, erc20Abi.abi, provider);
            quoteAfter = await quoteToken.balanceOf(userAddress);
        }

        // Print after balances
        console.log('\n--- Balances AFTER deposit ---');
        console.log('Base token:', ethers.utils.formatUnits(baseAfter, vaultContext.baseDecimals));
        console.log('Quote token:', ethers.utils.formatUnits(quoteAfter, vaultContext.quoteDecimals));
        console.log('');

        // Print delta
        let baseDelta = baseBefore.sub(baseAfter);
        let quoteDelta = quoteBefore.sub(quoteAfter);
        // If negative (should not happen), print as "increase"
        const baseDeltaStr = ethers.utils.formatUnits(baseDelta.abs(), vaultContext.baseDecimals);
        const quoteDeltaStr = ethers.utils.formatUnits(quoteDelta.abs(), vaultContext.quoteDecimals);
        if (baseDelta.gt(0)) {
            console.log(`Base token SPENT: ${baseDeltaStr}`);
        } else if (baseDelta.lt(0)) {
            console.log(`Base token INCREASED: ${baseDeltaStr}`);
        }
        if (quoteDelta.gt(0)) {
            console.log(`Quote token SPENT: ${quoteDeltaStr}`);
        } else if (quoteDelta.lt(0)) {
            console.log(`Quote token INCREASED: ${quoteDeltaStr}`);
        }
        if (baseDelta.eq(0)) {
            console.log('Base token did not change');
        }
        if (quoteDelta.eq(0)) {
            console.log('Quote token did not change');
        }
        console.log('');

        // Get final share balance
        const shareBalance = await KuruSdk.ActiveVault.getShareBalance(
            vaultAddress,
            userAddress,
            provider
        );
        console.log('Your total vault shares:', ethers.utils.formatUnits(shareBalance, 18));
        console.log('');

    } catch (error) {
        console.error('Error depositing to active vault:', error);
    }
})();
