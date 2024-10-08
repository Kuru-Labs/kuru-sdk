// ============ External Imports ============
import { ethers, BigNumber } from "ethers";

// ============ Internal Imports ============
import { VaultParams } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";

export abstract class VaultParamFetcher {
    /**
     * @dev Retrieves the vault parameters from the order book contract.
     * @param providerOrSigner - The ethers.js provider to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @returns A promise that resolves to the vault parameters.
     */
    static async getVaultParams(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string
    ): Promise<VaultParams> {
        const orderbook = new ethers.Contract(
            orderbookAddress,
            orderbookAbi.abi,
            providerOrSigner
        );

        const vaultParamsData = await orderbook.getVaultParams();
        return {
            kuruAmmVault: vaultParamsData[0],
            vaultBestBid: BigNumber.from(vaultParamsData[1]),
            bidPartiallyFilledSize: BigNumber.from(vaultParamsData[2]),
            vaultBestAsk: BigNumber.from(vaultParamsData[3]),
            askPartiallyFilledSize: BigNumber.from(vaultParamsData[4]),
            vaultBidOrderSize: BigNumber.from(vaultParamsData[5]),
            vaultAskOrderSize: BigNumber.from(vaultParamsData[6]),
            spread: BigNumber.from(vaultParamsData[7])
        };
    }
}