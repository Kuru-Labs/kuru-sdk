import { ethers } from "ethers";

export const getSigner = async (providerOrSignerOrContract: ethers.JsonRpcProvider | ethers.AbstractSigner | ethers.Contract): Promise<ethers.AbstractSigner> => {
    if (providerOrSignerOrContract instanceof ethers.JsonRpcProvider) {
        return await providerOrSignerOrContract.getSigner();
    } else if (providerOrSignerOrContract instanceof ethers.Contract) {
        return providerOrSignerOrContract.runner as ethers.AbstractSigner;
    }
    return providerOrSignerOrContract;
}
