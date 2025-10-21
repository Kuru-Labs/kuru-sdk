// ============ External Imports ============
import { BigNumber, ContractReceipt, ethers } from 'ethers';
import { VaultParamFetcher } from './params';
import { MarketParams, TransactionOptions, VaultParams } from 'src/types';
import { parseUnits } from 'ethers/lib/utils';

// ============ Internal Imports ============
import { getTokenDecimals, approveToken } from '../utils';
import vaultAbi from '../../abi/Vault.json';
import marginAbi from '../../abi/MarginAccount.json';
import erc20Abi from '../../abi/IERC20.json';
import buildTransactionRequest from '../utils/txConfig';

export abstract class Vault {
    static async deposit(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        ammVaultAddress: string,
        amount1: BigNumber,
        amount2: BigNumber,
        receiver: string,
        expectedAmount2?: BigNumber,
    ): Promise<ContractReceipt> {
        const expected = expectedAmount2 ?? amount2.mul(9970).div(10000); // 30 BPS default slippage
        const vaultContract = new ethers.Contract(ammVaultAddress, vaultAbi.abi, providerOrSigner);

        const tx = await vaultContract.deposit(amount1, amount2, expected, receiver);

        return tx.wait();
    }

    static async withdraw(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        shares: BigNumber,
        receiver: string,
        owner: string,
    ): Promise<ContractReceipt> {
        const vaultContract = new ethers.Contract(owner, vaultAbi.abi, providerOrSigner);

        const tx = await vaultContract.withdraw(shares, receiver, owner);

        return tx.wait();
    }

    /**
     * Return the shares owned by an address in a vault
     * @param vaultAddress The address of vault contract
     * @param signer The signer to use for the transaction
     * @returns A promise resolving to the number of shares of an address in a vault
     */

    static async getVaultShares(
        vaultAddress: string,
        userAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<BigNumber> {
        const vaultContract = new ethers.Contract(vaultAddress, vaultAbi.abi, providerOrSigner);
        return await vaultContract.balanceOf(userAddress, {
            from: ethers.constants.AddressZero,
        });
    }

    /**
     *
     * @param vaultAddress The address of the vault contract
     * @param marketAddress The address of the market contract
     * @param marginAccountAddress The address of the margin account contract
     * @param providerOrSigner The provider or signer to use for the transaction
     * @returns A promise that resolves to an object containing token1 and token2 address and balance
     */

    static async getVaultLiquidity(
        vaultAddress: string,
        baseAssetAddress: string,
        quoteAssetAddress: string,
        marginAccountAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ) {
        const marginAccountContract = new ethers.Contract(marginAccountAddress, marginAbi.abi, providerOrSigner);

        const token1 = await marginAccountContract.getBalance(vaultAddress, baseAssetAddress, {
            from: ethers.constants.AddressZero,
        });
        const token2 = await marginAccountContract.getBalance(vaultAddress, quoteAssetAddress, {
            from: ethers.constants.AddressZero,
        });

        return {
            token1: {
                address: baseAssetAddress,
                balance: token1,
            },
            token2: {
                address: quoteAssetAddress,
                balance: token2,
            },
        };
    }

    /**
     * Calculate the amount of tokens needed to deposit for a given number of shares
     * @param shares The number of shares to mint
     * @param vaultAddress The address of the vault contract
     * @param providerOrSigner The provider or signer to use for the transaction
     * @returns A promise that resolves to an object containing amount1 and amount2
     */
    static async calculateDepositForShares(
        shares: BigNumber,
        vaultAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<{ amount1: BigNumber; amount2: BigNumber }> {
        const vaultContract = new ethers.Contract(vaultAddress, vaultAbi.abi, providerOrSigner);
        const [amount1, amount2] = await vaultContract.previewMint(shares, {
            from: ethers.constants.AddressZero,
        });
        return { amount1, amount2 };
    }

    /**
     * Calculate the amount of tokens to be received for a given number of shares to withdraw
     * @param shares The number of shares to burn
     * @param vaultAddress The address of the vault contract
     * @param providerOrSigner The provider or signer to use for the transaction
     * @returns A promise that resolves to an object containing amount1 and amount2
     */
    static async calculateWithdrawForShares(
        shares: BigNumber,
        vaultAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<{ amount1: BigNumber; amount2: BigNumber }> {
        const vaultContract = new ethers.Contract(vaultAddress, vaultAbi.abi, providerOrSigner);
        const [amount1, amount2] = await vaultContract.previewRedeem(shares, {
            from: ethers.constants.AddressZero,
        });
        return { amount1, amount2 };
    }

    /**
     * Calculate the number of shares to be received for a given deposit of tokens
     * @param amount1 The amount of token1 to deposit
     * @param amount2 The amount of token2 to deposit
     * @param vaultAddress The address of the vault contract
     * @param providerOrSigner The provider or signer to use for the transaction
     * @returns A promise that resolves to the number of shares
     */
    static async calculateSharesForDeposit(
        amount1: BigNumber,
        amount2: BigNumber,
        vaultAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<BigNumber> {
        const vaultContract = new ethers.Contract(vaultAddress, vaultAbi.abi, providerOrSigner);
        return await vaultContract.previewDeposit(amount1, amount2, {
            from: ethers.constants.AddressZero,
        });
    }

    /**
     * Calculate the amount of token2 needed for a specific amount of token1 based on current price
     * @param amount1 The amount of token1
     * @param marketAddress The address of the market contract
     * @param providerOrSigner The provider or signer to use for the transaction
     * @returns A promise that resolves to the amount of token2 needed
     */
    static async calculateAmount2ForAmount1(
        amount1: BigNumber,
        marketAddress: string,
        marketParams: MarketParams,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<BigNumber> {
        const vaultParams: VaultParams = await VaultParamFetcher.getVaultParams(providerOrSigner, marketAddress);
        const price = vaultParams.vaultBestAsk;
        const token1Decimals = await getTokenDecimals(marketParams.baseAssetAddress, providerOrSigner);
        const token2Decimals = await getTokenDecimals(marketParams.quoteAssetAddress, providerOrSigner);
        //amount2 = (amount1 * price * 10^token2Decimals) / (10^token1Decimals * 10^18)
        return amount1
            .mul(price)
            .mul(parseUnits('1', token2Decimals))
            .div(parseUnits('1', token1Decimals))
            .div(parseUnits('1', 18));
    }

    /**
     * Calculate the amount of token1 needed for a specific amount of token2 based on current price
     * @param amount2 The amount of token2
     * @param marketAddress The address of the market contract
     * @param providerOrSigner The provider or signer to use for the transaction
     * @returns A promise that resolves to the amount of token1 needed
     */
    static async calculateAmount1ForAmount2(
        amount2: BigNumber,
        marketAddress: string,
        marketParams: MarketParams,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<BigNumber> {
        const vaultParams: VaultParams = await VaultParamFetcher.getVaultParams(providerOrSigner, marketAddress);
        const price = vaultParams.vaultBestAsk;
        const token1Decimals = await getTokenDecimals(marketParams.baseAssetAddress, providerOrSigner);
        const token2Decimals = await getTokenDecimals(marketParams.quoteAssetAddress, providerOrSigner);
        //amount1 = (amount2 * 10^token1Decimals * 10^18) / (price * 10^token2Decimals)
        return amount2
            .mul(parseUnits('1', token1Decimals))
            .mul(parseUnits('1', 18))
            .div(price)
            .div(parseUnits('1', token2Decimals));
    }

    /**
     * Deposit tokens into the vault based on the number of shares to mint
     * @param shares The number of shares to mint
     * @param marketAddress The address of the market contract
     * @param vaultAddress The address of the vault contract
     * @param signer The signer to use for the transaction
     * @param shouldApprove Whether to approve the tokens before depositing
     * @returns A promise that resolves to the transaction receipt
     */
    static async depositBasedOnShares(
        shares: BigNumber,
        marketParams: MarketParams,
        vaultAddress: string,
        signer: ethers.Signer,
        shouldApprove: boolean = false,
    ): Promise<ContractReceipt> {
        const vaultContract = new ethers.Contract(vaultAddress, vaultAbi.abi, signer);
        const { amount1, amount2 } = await this.calculateDepositForShares(shares, vaultAddress, signer);
        const token1Address = marketParams.baseAssetAddress;
        const token2Address = marketParams.quoteAssetAddress;

        let overrides = {};

        if (token1Address === ethers.constants.AddressZero) {
            overrides = { value: amount1 };
        } else if (shouldApprove) {
            const tokenContract = new ethers.Contract(token1Address, erc20Abi.abi, signer);
            await approveToken(tokenContract, vaultAddress, amount1, signer);
        }

        if (token2Address === ethers.constants.AddressZero) {
            overrides = { value: amount2 };
        } else if (shouldApprove) {
            const tokenContract = new ethers.Contract(token2Address, erc20Abi.abi, signer);
            await approveToken(tokenContract, vaultAddress, amount2, signer);
        }

        const tx = await vaultContract.mint(shares, await signer.getAddress(), overrides);
        return await tx.wait();
    }

    /**
     * Withdraw tokens from the vault based on the number of shares to burn
     * @param shares The number of shares to burn
     * @param vaultAddress The address of the vault contract
     * @param signer The signer to use for the transaction
     * @returns A promise that resolves to the transaction receipt
     */
    static async withdrawBasedOnShares(
        shares: BigNumber,
        vaultAddress: string,
        signer: ethers.Signer,
    ): Promise<ContractReceipt> {
        const vaultContract = new ethers.Contract(vaultAddress, vaultAbi.abi, signer);
        const tx = await vaultContract.redeem(shares, await signer.getAddress(), await signer.getAddress());
        return await tx.wait();
    }

    /**
     * Deposit tokens into the vault with given amounts of token1 and token2
     * @param amount1 The amount of token1 to deposit
     * @param amount2 The amount of token2 to deposit
     * @param marketAddress The address of the market contract
     * @param vaultAddress The address of the vault contract
     * @param signer The signer to use for the transaction
     * @param shouldApprove Whether to approve the tokens before depositing
     * @returns A promise that resolves to the transaction receipt
     */
    static async depositWithAmounts(
        amount1: BigNumber,
        amount2: BigNumber,
        baseAssetAddress: string,
        quoteAssetAddress: string,
        vaultAddress: string,
        signer: ethers.Signer,
        shouldApprove: boolean = false,
        expectedAmount2?: BigNumber,
    ): Promise<ContractReceipt> {
        const expected = expectedAmount2 ?? amount2.mul(9970).div(10000); // 30 BPS default slippage
        const vaultContract = new ethers.Contract(vaultAddress, vaultAbi.abi, signer);

        let overrides: ethers.PayableOverrides = {};

        if (baseAssetAddress === ethers.constants.AddressZero) {
            overrides.value = amount1;
        } else if (shouldApprove) {
            const tokenContract = new ethers.Contract(baseAssetAddress, erc20Abi.abi, signer);
            await approveToken(tokenContract, vaultAddress, amount1, signer);
        }

        if (quoteAssetAddress === ethers.constants.AddressZero) {
            overrides.value = amount2;
        } else if (shouldApprove) {
            const tokenContract = new ethers.Contract(quoteAssetAddress, erc20Abi.abi, signer);
            await approveToken(tokenContract, vaultAddress, amount2, signer);
        }

        const tx = await vaultContract.deposit(amount1, amount2, expected, await signer.getAddress(), overrides);
        return await tx.wait();
    }

    static async constructDepositTransaction(
        amount1: BigNumber,
        amount2: BigNumber,
        baseAssetAddress: string,
        quoteAssetAddress: string,
        vaultAddress: string,
        signer: ethers.Signer,
        expectedAmount2?: BigNumber,
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();
        const expected = expectedAmount2 ?? amount2.mul(9970).div(10000); // 30 BPS default slippage
        const vaultInterface = new ethers.utils.Interface(vaultAbi.abi);
        const data = vaultInterface.encodeFunctionData('deposit', [amount1, amount2, expected, address]);

        // Calculate the total value for native token deposits
        const txValue =
            baseAssetAddress === ethers.constants.AddressZero
                ? amount1
                : quoteAssetAddress === ethers.constants.AddressZero
                  ? amount2
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

    static async constructWithdrawTransaction(
        shares: BigNumber,
        vaultAddress: string,
        signer: ethers.Signer,
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const vaultInterface = new ethers.utils.Interface(vaultAbi.abi);

        const fromAddress = await signer.getAddress();

        const data = vaultInterface.encodeFunctionData('withdraw', [shares, fromAddress, fromAddress]);

        return buildTransactionRequest({
            to: vaultAddress,
            from: fromAddress,
            data,
            txOptions,
            signer,
        });
    }
}
