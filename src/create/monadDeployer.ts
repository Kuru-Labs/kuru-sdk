// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { TransactionOptions } from "src/types";
import { extractErrorMessage } from "../utils";

// ============ Config Imports ============
import monadDeployerAbi from "../../abi/MonadDeployer.json";
import { constructTxGasData } from "src/utils/transaction";

export interface TokenParams {
    name: string;
    symbol: string; 
    tokenURI: string;
    initialSupply: ethers.BigNumber;
    dev: string;
    supplyToDev: ethers.BigNumber;
}

export interface PoolParams {
    nativeTokenAmount: ethers.BigNumber;
    sizePrecision: ethers.BigNumber;
    pricePrecision: ethers.BigNumber;
    tickSize: ethers.BigNumber;
    minSize: ethers.BigNumber;
    maxSize: ethers.BigNumber;
    takerFeeBps: number;
    makerFeeBps: number;
}

export class MonadDeployer {
    static async constructDeployTokenAndMarketTransaction(
        signer: ethers.Signer,
        deployerAddress: string,
        tokenParams: TokenParams,
        marketParams: PoolParams,
        txOptions?: TransactionOptions
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();
        const deployer = new ethers.Contract(deployerAddress, monadDeployerAbi.abi, signer);

        // Get the kuruCollectiveFee
        const kuruCollectiveFee = await deployer.kuruCollectiveFee();

        const deployerInterface = new ethers.utils.Interface(monadDeployerAbi.abi);
        const data = deployerInterface.encodeFunctionData("deployTokenAndMarket", [
            tokenParams,
            marketParams
        ]);

        const value = marketParams.nativeTokenAmount.add(kuruCollectiveFee);

        return constructTxGasData(signer, deployerAddress, address, data, txOptions, value);
    }

    async deployTokenAndMarket(
        signer: ethers.Signer,
        deployerAddress: string,
        tokenParams: TokenParams,
        marketParams: PoolParams,
        txOptions?: TransactionOptions
    ): Promise<{tokenAddress: string, marketAddress: string}> {
        const deployer = new ethers.Contract(deployerAddress, monadDeployerAbi.abi, signer);

        try {
            const tx = await MonadDeployer.constructDeployTokenAndMarketTransaction(
                signer,
                deployerAddress,
                tokenParams,
                marketParams,
                txOptions
            );

            const transaction = await signer.sendTransaction(tx);
            const receipt = await transaction.wait(1);

            const pumpingTimeLog = receipt.logs.find(
                log => {
                    try {
                        const parsedLog = deployer.interface.parseLog(log);
                        return parsedLog.name === "PumpingTime";
                    } catch {
                        return false;
                    }
                }
            );
            
            if (!pumpingTimeLog) {
                throw new Error("PumpingTime event not found in transaction receipt");
            }

            const parsedLog = deployer.interface.parseLog(pumpingTimeLog);
            return {
                tokenAddress: parsedLog.args.token,
                marketAddress: parsedLog.args.market
            };
        } catch (e: any) {
            console.log({ e });
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }
}
