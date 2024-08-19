// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage } from "../utils";

// ============ Config Imports ============
import marginAccountAbi from "../../abi/MarginAccount.json";

export abstract class MarginBalance {
    static async getBalance(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        marginAccountAddress: string,
        userAddress: string,
        tokenAddress: string
    ): Promise<number> {
        try {
            const marginAccount = new ethers.Contract(
                marginAccountAddress,
                marginAccountAbi.abi,
                providerOrSigner
            );

            const balance = await marginAccount.getBalance(
                userAddress,
                tokenAddress
            );
            return parseFloat(ethers.utils.formatEther(balance));
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e.error.error.body);
        }
    }
}
