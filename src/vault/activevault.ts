// ============ External Imports ============
import { BigNumber, ContractReceipt, ethers } from 'ethers';

// ============ Internal Imports ============
import { TransactionOptions } from 'src/types';
import { approveToken } from '../utils';
import activeVaultAbi from '../../abi/ActiveVault.json';
import erc20Abi from '../../abi/IERC20.json';
import buildTransactionRequest from '../utils/txConfig';

export interface VaultContext {
    book: string;
    pricePrecision: number;
    baseDecimals: number;
    quoteDecimals: number;
    base: string;
    sizePrecision: BigNumber;
    quote: string;
    head: number;
    tail: number;
}

export class ActiveVault {
    /**
     * Get the vault context including base and quote token addresses
     * @param vaultAddress The address of the active vault contract
     * @param providerOrSigner The provider or signer to use
     * @returns A promise that resolves to the vault context
     */
    static async getVaultContext(
        vaultAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<VaultContext> {
        const vaultContract = new ethers.Contract(vaultAddress, activeVaultAbi.abi, providerOrSigner);
        const ctx = await vaultContract.ctx();
        
        return {
            book: ctx.book,
            pricePrecision: ctx.pricePrecision,
            baseDecimals: ctx.baseDecimals,
            quoteDecimals: ctx.quoteDecimals,
            base: ctx.base,
            sizePrecision: ctx.sizePrecision,
            quote: ctx.quote,
            head: ctx.head,
            tail: ctx.tail,
        };
    }

    /**
     * Get the current notional values of the vault
     * @param vaultAddress The address of the active vault contract
     * @param providerOrSigner The provider or signer to use
     * @returns A promise that resolves to base and quote notional values
     */
    static async getNotionalValues(
        vaultAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<{ baseNotional: BigNumber; quoteNotional: BigNumber }> {
        const vaultContract = new ethers.Contract(vaultAddress, activeVaultAbi.abi, providerOrSigner);
        const [baseNotional, quoteNotional] = await vaultContract.calculateNotionalValue();
        
        return { baseNotional, quoteNotional };
    }

    /**
     * Calculate the required quote amount for a given base amount based on current vault ratio
     * @param baseAmount The amount of base token
     * @param vaultAddress The address of the active vault contract
     * @param providerOrSigner The provider or signer to use
     * @returns A promise that resolves to the required quote amount
     */
    static async calculateQuoteForBase(
        baseAmount: BigNumber,
        vaultAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<BigNumber> {
        const { baseNotional, quoteNotional } = await this.getNotionalValues(vaultAddress, providerOrSigner);
        
        // If vault is empty, return 0
        if (baseNotional.isZero() || quoteNotional.isZero()) {
            return BigNumber.from(0);
        }
        
        // Calculate quote amount maintaining the current ratio
        // quoteAmount = (baseAmount * quoteNotional) / baseNotional
        return baseAmount.mul(quoteNotional).div(baseNotional);
    }

    /**
     * Calculate the required base amount for a given quote amount based on current vault ratio
     * @param quoteAmount The amount of quote token
     * @param vaultAddress The address of the active vault contract
     * @param providerOrSigner The provider or signer to use
     * @returns A promise that resolves to the required base amount
     */
    static async calculateBaseForQuote(
        quoteAmount: BigNumber,
        vaultAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<BigNumber> {
        const { baseNotional, quoteNotional } = await this.getNotionalValues(vaultAddress, providerOrSigner);
        
        // If vault is empty, return 0
        if (baseNotional.isZero() || quoteNotional.isZero()) {
            return BigNumber.from(0);
        }
        
        // Calculate base amount maintaining the current ratio
        // baseAmount = (quoteAmount * baseNotional) / quoteNotional
        return quoteAmount.mul(baseNotional).div(quoteNotional);
    }

    /**
     * Preview the amount of shares that will be minted for given deposit amounts
     * @param baseAmount The amount of base token to deposit
     * @param quoteAmount The amount of quote token to deposit
     * @param vaultAddress The address of the active vault contract
     * @param providerOrSigner The provider or signer to use
     * @returns A promise that resolves to the number of shares
     */
    static async previewDeposit(
        baseAmount: BigNumber,
        quoteAmount: BigNumber,
        vaultAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<BigNumber> {
        const vaultContract = new ethers.Contract(vaultAddress, activeVaultAbi.abi, providerOrSigner);
        return await vaultContract.previewDepositInShares(baseAmount, quoteAmount);
    }

    /**
     * Preview the amount of tokens that will be received for withdrawing shares
     * @param shares The number of shares to withdraw
     * @param vaultAddress The address of the active vault contract
     * @param providerOrSigner The provider or signer to use
     * @returns A promise that resolves to base and quote amounts
     */
    static async previewWithdraw(
        shares: BigNumber,
        vaultAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<{ baseAmount: BigNumber; quoteAmount: BigNumber }> {
        const vaultContract = new ethers.Contract(vaultAddress, activeVaultAbi.abi, providerOrSigner);
        const [baseAmount, quoteAmount] = await vaultContract.previewWithdrawInAmounts(shares);
        
        return { baseAmount, quoteAmount };
    }

    /**
     * Get the balance of shares for a user
     * @param vaultAddress The address of the active vault contract
     * @param userAddress The address of the user
     * @param providerOrSigner The provider or signer to use
     * @returns A promise that resolves to the share balance
     */
    static async getShareBalance(
        vaultAddress: string,
        userAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<BigNumber> {
        const vaultContract = new ethers.Contract(vaultAddress, activeVaultAbi.abi, providerOrSigner);
        return await vaultContract.balanceOf(userAddress);
    }

    /**
     * Deposit base and quote tokens into the active vault
     * @param baseAmount The amount of base token to deposit
     * @param quoteAmount The amount of quote token to deposit
     * @param vaultAddress The address of the active vault contract
     * @param signer The signer to use for the transaction
     * @param shouldApprove Whether to approve tokens before depositing
     * @returns A promise that resolves to the transaction receipt
     */
    static async deposit(
        baseAmount: BigNumber,
        quoteAmount: BigNumber,
        vaultAddress: string,
        signer: ethers.Signer,
        shouldApprove: boolean = false,
    ): Promise<ContractReceipt> {
        const vaultContract = new ethers.Contract(vaultAddress, activeVaultAbi.abi, signer);
        const ctx = await this.getVaultContext(vaultAddress, signer);
        
        let overrides: ethers.PayableOverrides = {};
        
        // Handle native token (ETH) deposits
        if (ctx.base === ethers.constants.AddressZero) {
            overrides.value = baseAmount;
        } else if (shouldApprove) {
            const tokenContract = new ethers.Contract(ctx.base, erc20Abi.abi, signer);
            await approveToken(tokenContract, vaultAddress, baseAmount, signer);
        }
        
        if (ctx.quote === ethers.constants.AddressZero) {
            overrides.value = quoteAmount;
        } else if (shouldApprove) {
            const tokenContract = new ethers.Contract(ctx.quote, erc20Abi.abi, signer);
            await approveToken(tokenContract, vaultAddress, quoteAmount, signer);
        }
        
        const tx = await vaultContract.deposit(baseAmount, quoteAmount, overrides);
        return await tx.wait();
    }

    /**
     * Withdraw shares from the active vault
     * @param shares The number of shares to withdraw
     * @param vaultAddress The address of the active vault contract
     * @param signer The signer to use for the transaction
     * @returns A promise that resolves to the transaction receipt
     */
    static async withdraw(
        shares: BigNumber,
        vaultAddress: string,
        signer: ethers.Signer,
    ): Promise<ContractReceipt> {
        const vaultContract = new ethers.Contract(vaultAddress, activeVaultAbi.abi, signer);
        const tx = await vaultContract.withdraw(shares);
        return await tx.wait();
    }

    /**
     * Construct a deposit transaction without executing it
     * @param baseAmount The amount of base token to deposit
     * @param quoteAmount The amount of quote token to deposit
     * @param vaultAddress The address of the active vault contract
     * @param signer The signer to use for the transaction
     * @param txOptions Optional transaction options
     * @returns A promise that resolves to the transaction request
     */
    static async constructDepositTransaction(
        baseAmount: BigNumber,
        quoteAmount: BigNumber,
        vaultAddress: string,
        signer: ethers.Signer,
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const ctx = await this.getVaultContext(vaultAddress, signer);
        const address = await signer.getAddress();
        
        const vaultInterface = new ethers.utils.Interface(activeVaultAbi.abi);
        const data = vaultInterface.encodeFunctionData('deposit', [baseAmount, quoteAmount]);
        
        // Calculate the value for native token deposits
        const txValue = ctx.base === ethers.constants.AddressZero
            ? baseAmount
            : ctx.quote === ethers.constants.AddressZero
              ? quoteAmount
              : BigNumber.from(0);
        
        return buildTransactionRequest({
            to: vaultAddress,
            from: address,
            data,
            value: txValue,
            txOptions,
            signer,
        });
    }

    /**
     * Construct a withdraw transaction without executing it
     * @param shares The number of shares to withdraw
     * @param vaultAddress The address of the active vault contract
     * @param signer The signer to use for the transaction
     * @param txOptions Optional transaction options
     * @returns A promise that resolves to the transaction request
     */
    static async constructWithdrawTransaction(
        shares: BigNumber,
        vaultAddress: string,
        signer: ethers.Signer,
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const vaultInterface = new ethers.utils.Interface(activeVaultAbi.abi);
        const fromAddress = await signer.getAddress();
        
        const data = vaultInterface.encodeFunctionData('withdraw', [shares]);
        
        return buildTransactionRequest({
            to: vaultAddress,
            from: fromAddress,
            data,
            txOptions,
            signer,
        });
    }
}
