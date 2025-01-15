// ============ External Imports ============
import { BigNumber, ContractReceipt, ethers } from "ethers";
import { VaultParamFetcher } from "./params";
import { ParamFetcher } from "../market";
import { MarketParams, VaultParams } from "src/types";
import { getTokenDecimals, approveToken } from "../utils";
import erc20Abi from "../../abi/IERC20.json";
// ============ Internal Imports ============
import vaultAbi from "../../abi/Vault.json";
import marginAbi from "../../abi/MarginAccount.json";
import { parseUnits } from "ethers/lib/utils";

export abstract class Vault {

    static async deposit(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        ammVaultAddress: string,
        amount1: BigNumber,
        amount2: BigNumber,
        receiver: string
    ): Promise<ContractReceipt> {
        const contractInstance = new ethers.Contract(
            ammVaultAddress,
            vaultAbi.abi,
            providerOrSigner
        );

        const tx = await contractInstance.deposit(amount1, amount2, receiver);

        return tx.wait();
    }

    static async withdraw(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        shares: BigNumber,
        receiver: string,
        owner: string
    ): Promise<ContractReceipt> {
        const contractInstance = new ethers.Contract(
            owner,
            vaultAbi.abi,
            providerOrSigner
        );

        const tx = await contractInstance.withdraw(shares, receiver, owner);

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
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer
    ): Promise<BigNumber> {
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, providerOrSigner);
        return await vault.balanceOf(userAddress, {from: ethers.constants.AddressZero});
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
        marketAddress: string,
        marginAccountAddress: string,
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer
    ) {
        const marginAccount = new ethers.Contract(
            marginAccountAddress,
            marginAbi.abi,
            providerOrSigner
        );

        const { baseAssetAddress, quoteAssetAddress } =
            await ParamFetcher.getMarketParams(providerOrSigner, marketAddress);

        const token1 = await marginAccount.getBalance(
            vaultAddress,
            baseAssetAddress,
            {from: ethers.constants.AddressZero}
        );
        const token2 = await marginAccount.getBalance(
            vaultAddress,
            quoteAssetAddress,
            {from: ethers.constants.AddressZero}
        );

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
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer
    ): Promise<{ amount1: BigNumber; amount2: BigNumber }> {
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, providerOrSigner);
        const [amount1, amount2] = await vault.previewMint(shares, {from: ethers.constants.AddressZero});
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
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer
    ): Promise<{ amount1: BigNumber; amount2: BigNumber }> {
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, providerOrSigner);
        const [amount1, amount2] = await vault.previewRedeem(shares, {from: ethers.constants.AddressZero});
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
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer
    ): Promise<BigNumber> {
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, providerOrSigner);
        return await vault.previewDeposit(amount1, amount2, {from: ethers.constants.AddressZero});
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
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
    ): Promise<BigNumber> {
        const vaultParams: VaultParams = await VaultParamFetcher.getVaultParams(
            providerOrSigner,
            marketAddress
        );
        const marketParams: MarketParams = await ParamFetcher.getMarketParams(
            providerOrSigner,
            marketAddress
        );
        const price = vaultParams.vaultBestAsk;
        const token1Decimals = await getTokenDecimals(marketParams.baseAssetAddress, providerOrSigner);
        const token2Decimals = await getTokenDecimals(marketParams.quoteAssetAddress, providerOrSigner);
        //amount2 = (amount1 * price * 10^token2Decimals) / (10^token1Decimals * 10^18)
        return amount1.mul(price).mul(parseUnits("1", token2Decimals)).div(parseUnits("1", token1Decimals)).div(parseUnits("1", 18));
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
        marketAddress: string,
        vaultAddress: string,
        signer: ethers.Signer,
        shouldApprove: boolean = false
    ): Promise<ContractReceipt> {
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, signer);
        const { amount1, amount2 } = await this.calculateDepositForShares(
            shares,
            vaultAddress,
            signer
        );
        const marketParams: MarketParams = await ParamFetcher.getMarketParams(
            signer,
            marketAddress
        );
        const token1Address = marketParams.baseAssetAddress;
        const token2Address = marketParams.quoteAssetAddress;

        let overrides = {};

        if (token1Address === ethers.constants.AddressZero) {
            overrides = { value: amount1 };
        } else if (shouldApprove) {
            const tokenContract = new ethers.Contract(token1Address, erc20Abi.abi, signer);
            await approveToken(
                tokenContract,
                vaultAddress,
                amount1,
                signer
            );
        }

        if (token2Address === ethers.constants.AddressZero) {
            overrides = { value: amount2 };
        } else if (shouldApprove) {
            const tokenContract = new ethers.Contract(token2Address, erc20Abi.abi, signer);
            await approveToken(
                tokenContract,
                vaultAddress,
                amount2,
                signer
            );
        }

        const tx = await vault.mint(
            shares,
            await signer.getAddress(),
            overrides
        );
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
        signer: ethers.Signer
    ): Promise<ContractReceipt> {
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, signer);
        const tx = await vault.redeem(
            shares,
            await signer.getAddress(),
            await signer.getAddress()
        );
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
        marketAddress: string,
        vaultAddress: string,
        signer: ethers.Signer,
        shouldApprove: boolean = false
    ): Promise<ContractReceipt> {
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, signer);

        const { baseAssetAddress, quoteAssetAddress } = await ParamFetcher.getMarketParams(
            signer,
            marketAddress
        );


        let overrides: ethers.PayableOverrides = {};

        if (baseAssetAddress === ethers.constants.AddressZero) {
            overrides.value = amount1;
        } else if (shouldApprove) {
            const tokenContract = new ethers.Contract(baseAssetAddress, erc20Abi.abi, signer);
            await approveToken(
                tokenContract,
                vaultAddress,
                amount1,
                signer
            );
        }

        if (quoteAssetAddress === ethers.constants.AddressZero) {
            overrides.value = amount2;
        } else if (shouldApprove) {
            const tokenContract = new ethers.Contract(quoteAssetAddress, erc20Abi.abi, signer);
            await approveToken(
                tokenContract,
                vaultAddress,
                amount2,
                signer
            );
        }

        const tx = await vault.deposit(
            amount1,
            amount2,
            await signer.getAddress(),
            overrides
        );
        return await tx.wait();
    }
}