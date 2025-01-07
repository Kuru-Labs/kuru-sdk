// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { TransactionOptions } from "../types";
import { extractErrorMessage } from "../utils";

// ============ Config Imports ============
import monadDeployerAbi from "../../abi/MonadDeployer.json";

export interface TokenParams {
    name: string;
    symbol: string; 
    tokenURI: string;
    initialSupply: BigInt;
    dev: string;
    supplyToDev: BigInt;
}

export interface PoolParams {
    nativeTokenAmount: BigInt;
    sizePrecision: BigInt;
    pricePrecision: number;
    tickSize: number;
    minSize: BigInt;
    maxSize: BigInt;
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
    ): Promise<ethers.TransactionRequest> {
        const address = await signer.getAddress();
        const deployer = new ethers.Contract(deployerAddress, monadDeployerAbi.abi, signer);

        // Get the kuruCollectiveFee
        const kuruCollectiveFee = await deployer.kuruCollectiveFee();

        const deployerInterface = new ethers.Interface(monadDeployerAbi.abi);
        const data = deployerInterface.encodeFunctionData("deployTokenAndMarket", [
            tokenParams,
            marketParams
        ]);

        const tx: ethers.TransactionRequest = {
            to: deployerAddress,
            from: address,
            data,
            value: marketParams.nativeTokenAmount + kuruCollectiveFee,
            ...(txOptions?.nonce !== undefined && { nonce: txOptions.nonce }),
            ...(txOptions?.gasLimit && { gasLimit: txOptions.gasLimit }),
            ...(txOptions?.gasPrice && { gasPrice: txOptions.gasPrice }),
            ...(txOptions?.maxFeePerGas && { maxFeePerGas: txOptions.maxFeePerGas }),
            ...(txOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: txOptions.maxPriorityFeePerGas })
        } as ethers.TransactionRequest;

        const [gasLimit, baseGasPrice] = await Promise.all([
            !tx.gasLimit ? signer.estimateGas({
                ...tx,
                gasPrice: ethers.parseUnits('1', 'gwei'),
            }) : Promise.resolve(tx.gasLimit),
            (!tx.gasPrice && !tx.maxFeePerGas) ? (await signer.provider!.getFeeData()).gasPrice : Promise.resolve(undefined)
        ]);

        if (!tx.gasLimit) {
            tx.gasLimit = gasLimit;
        }

        if (!tx.gasPrice && !tx.maxFeePerGas && baseGasPrice) {
            if (txOptions?.priorityFee) {
                const priorityFeeWei = ethers.parseUnits(
                    txOptions.priorityFee.toString(),
                    'gwei'
                );
                tx.gasPrice = baseGasPrice + priorityFeeWei;
            } else {
                tx.gasPrice = baseGasPrice;
            }
        }

        return tx;
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

            const pumpingTimeLog = receipt?.logs.find(
                log => {
                    try {
                        const parsedLog = deployer.interface.parseLog(log);
                        return parsedLog?.name === "PumpingTime";
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
                tokenAddress: parsedLog?.args.token,
                marketAddress: parsedLog?.args.market
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
