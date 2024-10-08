import { ethers } from "ethers";

import IERC20 from "../../abi/IERC20.json";

export class ERC20 {
    private contract: ethers.Contract;

    constructor(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        contractAddress: string
    ) {
        this.contract = new ethers.Contract(
            contractAddress,
            IERC20.abi,
            providerOrSigner
        );
    }

    async getTokenDetails() {
        const [name, symbol, decimals, totalSupply] = await Promise.all<
            [string, string, number, number]
        >([
            this.contract.name(),
            this.contract.symbol(),
            this.contract.decimals(),
            this.contract.totalSupply(),
        ]);

        return {
            name,
            symbol,
            decimals,
            totalSupply: totalSupply.toString(),
        };
    }
}
