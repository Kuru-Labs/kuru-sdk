// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import vaultAbi from "../../abi/Vault.json";

export abstract class Vault {
    static async deposit(
        providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
        ammVaultAddress: string,
        amount1: bigint,
        amount2: bigint,
        receiver: string
    ): Promise<ethers.TransactionReceipt> {
        const contractInstance = new ethers.Contract(
            ammVaultAddress,
            vaultAbi.abi,
            providerOrSigner
        );

        const tx = await contractInstance.deposit(amount1, amount2, receiver);

        return tx.wait();
    }

    static async withdraw(
        providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
        shares: bigint,
        receiver: string,
        owner: string
    ): Promise<ethers.TransactionReceipt> {
        const contractInstance = new ethers.Contract(
            owner,
            vaultAbi.abi,
            providerOrSigner
        );

        const tx = await contractInstance.withdraw(shares, receiver, owner);

        return tx.wait();
    }
}
