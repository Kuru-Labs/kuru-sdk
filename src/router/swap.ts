// ============ External Imports ============
import { ethers } from "ethers";

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
import { getSigner } from "../utils/signer";
import { buildTransaction } from "../utils/transaction";

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
        tokenInAmount: bigint,
        minTokenOutAmount: bigint,
        txOptions?: TransactionOptions,
    ): Promise<ethers.TransactionRequest> {
        const routerInterface = new ethers.Interface(routerAbi.abi);
        const data = routerInterface.encodeFunctionData("anyToAnySwap", [
            routeOutput.route.path.map((pool) => pool.orderbook),
            routeOutput.isBuy,
            routeOutput.nativeSend,
            routeOutput.route.tokenIn,
            routeOutput.route.tokenOut,
            tokenInAmount,
            minTokenOutAmount
        ]);

        const value = routeOutput.nativeSend[0] ? tokenInAmount : BigInt(0);

        const tx = await buildTransaction(signer, routerAddress, data, value, txOptions);

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
        providerOrSigner: ethers.JsonRpcProvider | ethers.AbstractSigner,
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
    ): Promise<ethers.TransactionReceipt> {
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

            const tokenInAmount = ethers.parseUnits(
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

            const minTokenOutAmount = ethers.parseUnits(
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

            const signer = await getSigner(router);

            const tx = await TokenSwap.constructSwapTransaction(
                signer,
                routerAddress,
                routeOutput,
                tokenInAmount,
                minTokenOutAmount,
                txOptions
            );

            const transaction = await signer.sendTransaction(tx);
            const receipt = await transaction.wait();
            return receipt!;
        } catch (e: any) {
            console.error({ e });
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }

    static async estimateGas(
        providerOrSigner: ethers.JsonRpcProvider | ethers.Signer,
        routerAddress: string,
        routeOutput: RouteOutput,
        amountIn: number,
        inTokenDecimals: number,
        outTokenDecimals: number,
        slippageTolerance: number,
        approveTokens: boolean
    ): Promise<bigint> {
        try {
            const tokenContract = new ethers.Contract(
                routeOutput.route.tokenIn,
                erc20Abi.abi,
                providerOrSigner
            );
            const tokenInAmount = ethers.parseUnits(
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

            const minTokenOutAmount = ethers.parseUnits(
                (
                    (routeOutput.output * (100 - slippageTolerance)) /
                    100
                ).toString(),
                outTokenDecimals
            );

            const gasEstimate = await router.anyToAnySwap.estimateGas(
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
