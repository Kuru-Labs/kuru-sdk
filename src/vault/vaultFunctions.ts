// ============ External Imports ============
import { BigNumber, ContractReceipt, ethers } from "ethers";
import { VaultParamFetcher } from "./vaultParams";
import { ParamFetcher } from "../market";
import { MarketParams, VaultParams } from "src/types";

// ============ Internal Imports ============
import vaultAbi from "../../abi/Vault.json";
import marginAbi from "../../abi/MarginAccount.json";

export abstract class Vault {
    /**
     * Return the shares owned by an address in a vault
     * @param vaultAddress The address of vault contract
     * @param signer The signer to use for the transaction
     * @returns A promise resolving to the number of shares of an address in a vault
     */

    static async getVaultShares(
        vaultAddress: string,
        signer: ethers.Signer
    ): Promise<BigNumber> {
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, signer);
        const address = await signer.getAddress();
        return await vault.balanceOf(address);
    }

    /**
     *
     * @param vaultAddress The address of the vault contract
     * @param marketAddress The address of the market contract
     * @param marginAccountAddress The address of the margin account contract
     * @param signer The signer to use for the transaction
     * @returns A promise that resolves to an object containing token1 and token2 address and balance
     */

    static async getVaultLiquidity(
        vaultAddress: string,
        marketAddress: string,
        marginAccountAddress: string,
        signer: ethers.Signer
    ) {
        const marginAccount = new ethers.Contract(
            marginAccountAddress,
            marginAbi.abi,
            signer
        );

        const { baseAssetAddress, quoteAssetAddress } =
            await ParamFetcher.getMarketParams(signer, marketAddress);

        const token1 = await marginAccount.getBalance(
            vaultAddress,
            baseAssetAddress
        );
        const token2 = await marginAccount.getBalance(
            vaultAddress,
            quoteAssetAddress
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
     * @param signer The signer to use for the transaction
     * @returns A promise that resolves to an object containing amount1 and amount2
     */
    static async calculateDepositForShares(
        shares: BigNumber,
        vaultAddress: string,
        signer: ethers.Signer
    ): Promise<{ amount1: BigNumber; amount2: BigNumber }> {
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, signer);
        const [amount1, amount2] = await vault.previewMint(shares);
        return { amount1, amount2 };
    }

    /**
     * Calculate the amount of tokens to be received for a given number of shares to withdraw
     * @param shares The number of shares to burn
     * @param vaultAddress The address of the vault contract
     * @param signer The signer to use for the transaction
     * @returns A promise that resolves to an object containing amount1 and amount2
     */
    static async calculateWithdrawForShares(
        shares: BigNumber,
        vaultAddress: string,
        signer: ethers.Signer
    ): Promise<{ amount1: BigNumber; amount2: BigNumber }> {
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, signer);
        const [amount1, amount2] = await vault.previewRedeem(shares);
        return { amount1, amount2 };
    }

    /**
     * Calculate the number of shares to be received for a given deposit of tokens
     * @param amount1 The amount of token1 to deposit
     * @param amount2 The amount of token2 to deposit
     * @param vaultAddress The address of the vault contract
     * @param signer The signer to use for the transaction
     * @returns A promise that resolves to the number of shares
     */
    static async calculateSharesForDeposit(
        amount1: BigNumber,
        amount2: BigNumber,
        vaultAddress: string,
        signer: ethers.Signer
    ): Promise<BigNumber> {
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, signer);
        return await vault.previewDeposit(amount1, amount2);
    }

    /**
     * Calculate the amount of token2 needed for a specific amount of token1 based on current price
     * @param amount1 The amount of token1
     * @param marketAddress The address of the market contract
     * @param signer The signer to use for the transaction
     * @returns A promise that resolves to the amount of token2 needed
     */
    static async calculateAmount2ForAmount1(
        amount1: BigNumber,
        marketAddress: string,
        signer: ethers.Signer
    ): Promise<BigNumber> {
        const vaultParams: VaultParams = await VaultParamFetcher.getVaultParams(
            signer,
            marketAddress
        );
        const price = vaultParams.vaultBestAsk;
        return amount1.mul(price).div(ethers.constants.WeiPerEther);
    }

    /**
     * Deposit tokens into the vault based on the amount of token1
     * @param amount1 The amount of token1 to deposit
     * @param vaultAddress The address of the vault contract
     * @param marketAddress The address of the market contract
     * @param signer The signer to use for the transaction
     * @param shouldApprove Whether to approve the tokens before depositing
     * @returns A promise that resolves to the transaction receipt
     */
    static async depositBasedOnAmount1(
        amount1: BigNumber,
        vaultAddress: string,
        marketAddress: string,
        signer: ethers.Signer,
        shouldApprove: boolean = false
    ): Promise<ContractReceipt> {
        const amount2 = await this.calculateAmount2ForAmount1(
            amount1,
            marketAddress,
            signer
        );
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, signer);

        const marketParams: MarketParams = await ParamFetcher.getMarketParams(
            signer,
            marketAddress
        );
        const token1Address = marketParams.baseAssetAddress;
        const token2Address = marketParams.quoteAssetAddress;

        let overrides = {};
        if (token1Address === ethers.constants.AddressZero) {
            overrides = { ...overrides, value: amount1 };
        } else if (shouldApprove) {
            await this.approveToken(
                token1Address,
                vaultAddress,
                amount1,
                signer
            );
        }

        if (token2Address === ethers.constants.AddressZero) {
            overrides = { ...overrides, value: amount2 };
        } else if (shouldApprove) {
            await this.approveToken(
                token2Address,
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
            overrides = { ...overrides, value: amount1 };
        } else if (shouldApprove) {
            await this.approveToken(
                token1Address,
                vaultAddress,
                amount1,
                signer
            );
        }

        if (token2Address === ethers.constants.AddressZero) {
            overrides = { ...overrides, value: amount2 };
        } else if (shouldApprove) {
            await this.approveToken(
                token2Address,
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
     * Withdraw tokens from the vault based on the amount of token1 to withdraw
     * @param amount1 The amount of token1 to withdraw
     * @param vaultAddress The address of the vault contract
     * @param signer The signer to use for the transaction
     * @returns A promise that resolves to the transaction receipt
     */
    static async withdrawBasedOnAmount1(
        amount1: BigNumber,
        vaultAddress: string,
        signer: ethers.Signer
    ): Promise<ContractReceipt> {
        const vault = new ethers.Contract(vaultAddress, vaultAbi.abi, signer);
        const totalAssets = await vault.totalAssets();
        const totalSupply = await vault.totalSupply();
        const shares = amount1.mul(totalSupply).div(totalAssets[0]);
        const tx = await vault.withdraw(
            shares,
            await signer.getAddress(),
            await signer.getAddress()
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

        const marketParams: MarketParams = await ParamFetcher.getMarketParams(
            signer,
            marketAddress
        );
        const token1Address = marketParams.baseAssetAddress;
        const token2Address = marketParams.quoteAssetAddress;

        let overrides: ethers.PayableOverrides = {};

        if (token1Address === ethers.constants.AddressZero) {
            overrides.value = amount1;
        } else if (shouldApprove) {
            await this.approveToken(
                token1Address,
                vaultAddress,
                amount1,
                signer
            );
        }

        if (token2Address === ethers.constants.AddressZero) {
            overrides.value = amount2;
        } else if (shouldApprove) {
            await this.approveToken(
                token2Address,
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

    /**
     * Approve a token for spending
     * @param tokenAddress The address of the token to approve
     * @param spenderAddress The address of the contract to approve for spending
     * @param amount The amount to approve
     * @param signer The signer to use for the transaction
     */
    private static async approveToken(
        tokenAddress: string,
        spenderAddress: string,
        amount: BigNumber,
        signer: ethers.Signer
    ): Promise<void> {
        const token = new ethers.Contract(
            tokenAddress,
            [
                "function approve(address spender, uint256 amount) public returns (bool)",
            ],
            signer
        );
        const tx = await token.approve(spenderAddress, amount);
        await tx.wait();
    }
}
