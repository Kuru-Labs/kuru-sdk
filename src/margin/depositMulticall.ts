// ============ External Imports ============
import { ethers } from "ethers";
import { Multicall, ContractCallContext } from "ethereum-multicall";

// ============ Config Imports ============
import erc20Abi from "../../abi/IERC20.json";
import marginAccountAbi from "../../abi/MarginAccount.json";

export abstract class MarginDepositMulticall {
    static async depositMulticall(
        provider: ethers.providers.Provider,
        marginAccountAddress: string,
        userAddress: string,
        tokenAddress: string,
        amount: number,
        decimals: number
    ): Promise<void> {
        const multicall = new Multicall({
            ethersProvider: provider,
            tryAggregate: true
        });
        const formattedAmount = ethers.utils.parseUnits(
            amount.toString(),
            decimals
        );
        const contractCallContext: ContractCallContext[] = [
            {
                reference: "tokenContract",
                contractAddress: tokenAddress,
                abi: erc20Abi.abi,
                calls: [
                    {
                        reference: "approveCall",
                        methodName: "approve",
                        methodParameters: [
                            marginAccountAddress,
                            formattedAmount
                        ]
                    }
                ]
            },
            {
                reference: "MarginAccount",
                contractAddress: marginAccountAddress,
                abi: marginAccountAbi.abi,
                calls: [
                    {
                        reference: "depositCall",
                        methodName: "deposit",
                        methodParameters: [
                            userAddress,
                            tokenAddress,
                            formattedAmount
                        ]
                    }
                ]
            }
        ];

        await multicall.call(contractCallContext);
    }
}
