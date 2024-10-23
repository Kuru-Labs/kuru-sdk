// ============ External Imports ============
import { ContractReceipt, ethers } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage } from "../utils";

// ============ Config Imports ============
import marginAccountAbi from "../../abi/MarginAccount.json";

export abstract class MarginWithdraw {
    static async withdraw(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        marginAccountAddress: string,
        tokenAddress: string,
        amount: number,
        decimals: number
    ): Promise<ContractReceipt> {
        try {
            const marginAccount = new ethers.Contract(marginAccountAddress, marginAccountAbi.abi, providerOrSigner);
    
            const formattedAmount = ethers.utils.parseUnits(amount.toString(), decimals);
            const tx = await marginAccount.withdraw(formattedAmount, tokenAddress);
            return await tx.wait();
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }
}
