// ============ External Imports ============
import { ethers } from "ethers";
// ============ Internal Imports ============
import erc20Abi from "../../abi/IERC20.json";

export async function getTokenDecimals(tokenAddress: string, providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer): Promise<number> {
    const contract = new ethers.Contract(tokenAddress, erc20Abi.abi, providerOrSigner);
    return await contract.decimals();
}
