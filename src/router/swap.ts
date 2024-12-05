// ============ External Imports ============
import { ContractReceipt, ethers, BigNumber } from "ethers";

// ============ Internal Imports ============
import { TransactionOptions, SlippageOptions } from "../types";
import {
    extractErrorMessage,
    approveToken,
    estimateApproveGas,
} from "../utils";
import { RouteOutput } from "../types/pool";
import { calculateDynamicSlippage } from "../utils";

// ============ Config Imports ============
import erc20Abi from "../../abi/IERC20.json";
import routerAbi from "../../abi/Router.json";

export abstract class TokenSwap {
    /**
     * @dev Constructs a transaction for token swapping.
     * @param signer - The signer instance.
     * @param routerAddress - The address of the router contract.
     * @param routeOutput - The route output containing path and other swap details.
     * @param tokenInAmount - The amount of input tokens.
     * @param minTokenOutAmount - The minimum amount of output tokens to receive.
     * @param txOptions - Optional transaction parameters.
     * @returns A promise that resolves to the transaction request object.
     */
    static async constructSwapTransaction(
        signer: ethers.Signer,
        routerAddress: string,
        routeOutput: RouteOutput,
        tokenInAmount: BigNumber,
        minTokenOutAmount: BigNumber,
        txOptions?: TransactionOptions,
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();

        const routerInterface = new ethers.utils.Interface(routerAbi.abi);
        const data = routerInterface.encodeFunctionData("anyToAnySwap", [
            routeOutput.route.path.map((pool) => pool.orderbook),
            routeOutput.isBuy,
            routeOutput.nativeSend,
            routeOutput.route.tokenIn,
            routeOutput.route.tokenOut,
            tokenInAmount,
            minTokenOutAmount
        ]);

        const tx: ethers.providers.TransactionRequest = {
            to: routerAddress,
            from: address,
            data,
            value: routeOutput.nativeSend[0] ? tokenInAmount : 0,
            ...(txOptions?.nonce !== undefined && { nonce: txOptions.nonce }),
            ...(txOptions?.gasLimit && { gasLimit: txOptions.gasLimit }),
            ...(txOptions?.gasPrice && { gasPrice: txOptions.gasPrice }),
            ...(txOptions?.maxFeePerGas && { maxFeePerGas: txOptions.maxFeePerGas }),
            ...(txOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: txOptions.maxPriorityFeePerGas })
        };

        const [gasLimit, baseGasPrice] = await Promise.all([
            !tx.gasLimit ? signer.estimateGas({
                ...tx,
                gasPrice: ethers.utils.parseUnits('1', 'gwei'),
            }) : Promise.resolve(tx.gasLimit),
            (!tx.gasPrice && !tx.maxFeePerGas) ? signer.provider!.getGasPrice() : Promise.resolve(undefined)
        ]);

        if (!tx.gasLimit) {
            tx.gasLimit = gasLimit;
        }

        if (!tx.gasPrice && !tx.maxFeePerGas && baseGasPrice) {
            if (txOptions?.priorityFee) {
                const priorityFeeWei = ethers.utils.parseUnits(
                    txOptions.priorityFee.toString(),
                    'gwei'
                );
                tx.gasPrice = baseGasPrice.add(priorityFeeWei);
            } else {
                tx.gasPrice = baseGasPrice;
            }
        }

        return tx;
    }

    /**
     * @dev Executes a token swap.
     * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
     * @param routerAddress - The address of the router contract.
     * @param routeOutput - The route output containing path and other swap details.
     * @param amountIn - The amount of input tokens.
     * @param inTokenDecimals - The decimals of the input token.
     * @param outTokenDecimals - The decimals of the output token.
     * @param slippageTolerance - The maximum acceptable slippage.
     * @param approveTokens - Whether to approve token spending before the swap.
     * @param approvalCallback - Callback function for approval transaction hash.
     * @param txOptions - Optional transaction parameters.
     * @param slippageOptions - Optional slippage options.
     * @returns A promise that resolves to the transaction receipt.
     */
    static async swap(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        routerAddress: string,
        routeOutput: RouteOutput,
        amountIn: number,
        inTokenDecimals: number,
        outTokenDecimals: number,
        slippageTolerance: number,
        approveTokens: boolean,
        approvalCallback: (txHash: string | null) => void,
        txOptions?: TransactionOptions,
        slippageOptions?: SlippageOptions
    ): Promise<ContractReceipt> {
        try {
            const router = new ethers.Contract(
                routerAddress,
                routerAbi.abi,
                providerOrSigner
            );

            const tokenContract = new ethers.Contract(
                routeOutput.route.tokenIn,
                erc20Abi.abi,
                providerOrSigner
            );

            const tokenInAmount = ethers.utils.parseUnits(
                amountIn.toString(),
                inTokenDecimals
            );

            slippageTolerance = slippageOptions ? calculateDynamicSlippage(
                slippageOptions.defaultSlippageBps,
                amountIn,
                slippageOptions.priceImpactBps,
                slippageOptions.ohlcvData
            ) : slippageTolerance;

            const clippedOutput = Number(
                (routeOutput.output * (100 - slippageTolerance)) / 100
            ).toFixed(outTokenDecimals);

            const minTokenOutAmount = ethers.utils.parseUnits(
                clippedOutput.toString(),
                outTokenDecimals
            );

            if (approveTokens) {
                const txHash = await approveToken(
                    tokenContract,
                    routerAddress,
                    tokenInAmount,
                    providerOrSigner
                );

                if (approvalCallback) {
                    approvalCallback(txHash);
                }
            }

            const tx = await TokenSwap.constructSwapTransaction(
                router.signer,
                routerAddress,
                routeOutput,
                tokenInAmount,
                minTokenOutAmount,
                txOptions
            );
            console.log(tx);

            const transaction = await router.signer.sendTransaction(tx);
            return await transaction.wait();
        } catch (e: any) {
            console.error({ e });
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }

    static async estimateGas(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        routerAddress: string,
        routeOutput: RouteOutput,
        amountIn: number,
        inTokenDecimals: number,
        outTokenDecimals: number,
        slippageTolerance: number,
        approveTokens: boolean
    ): Promise<ethers.BigNumber> {
        try {
            const tokenContract = new ethers.Contract(
                routeOutput.route.tokenIn,
                erc20Abi.abi,
                providerOrSigner
            );
            const tokenInAmount = ethers.utils.parseUnits(
                amountIn.toString(),
                inTokenDecimals
            );

            if (approveTokens) {
                return estimateApproveGas(
                    tokenContract,
                    routerAddress,
                    tokenInAmount
                );
            }

            const router = new ethers.Contract(
                routerAddress,
                routerAbi.abi,
                providerOrSigner
            );

            const minTokenOutAmount = ethers.utils.parseUnits(
                (
                    (routeOutput.output * (100 - slippageTolerance)) /
                    100
                ).toString(),
                outTokenDecimals
            );

            const gasEstimate = await router.estimateGas.anyToAnySwap(
                routeOutput.route.path.map((pool) => pool.orderbook),
                routeOutput.isBuy,
                routeOutput.nativeSend,
                routeOutput.route.tokenIn,
                routeOutput.route.tokenOut,
                tokenInAmount,
                minTokenOutAmount
            );

            return gasEstimate;
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }
}
