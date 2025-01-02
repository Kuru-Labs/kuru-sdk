// ============ External Imports ============
import { ethers } from "ethers";

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
        providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
        orderbookAddress: string
    ): Promise<VaultParams> {
        const orderbook = new ethers.Contract(
            orderbookAddress,
            orderbookAbi.abi,
            providerOrSigner
        );

        const vaultParamsData = await orderbook.getVaultParams({from: ethers.ZeroAddress});
        return {
            kuruAmmVault: vaultParamsData[0],
            vaultBestBid: BigInt(vaultParamsData[1]),
            bidPartiallyFilledSize: BigInt(vaultParamsData[2]),
            vaultBestAsk: BigInt(vaultParamsData[3]),
            askPartiallyFilledSize: BigInt(vaultParamsData[4]),
            vaultBidOrderSize: BigInt(vaultParamsData[5]),
            vaultAskOrderSize: BigInt(vaultParamsData[6]),
            spread: BigInt(vaultParamsData[7])
        };
    }
}