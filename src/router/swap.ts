// ============ External Imports ============
import { ContractReceipt, ethers } from "ethers";

// ============ Internal Imports ============
import {
    extractErrorMessage,
    approveToken,
    estimateApproveGas,
} from "../utils";
import { RouteOutput } from "../types/pool";

// ============ Config Imports ============
import erc20Abi from "../../abi/IERC20.json";
import routerAbi from "../../abi/Router.json";

export abstract class TokenSwap {
    static async swap(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        routerAddress: string,
        routeOutput: RouteOutput,
        amountIn: number,
        inTokenDecimals: number,
        outTokenDecimals: number,
        slippageTolerance: number,
        approveTokens: boolean,
        approvalCallback: (txHash: string | null) => void
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

            const tx = await router.anyToAnySwap(
                routeOutput.route.path.map((pool) => pool.orderbook),
                routeOutput.isBuy,
                routeOutput.nativeSend,
                routeOutput.route.tokenIn,
                routeOutput.route.tokenOut,
                tokenInAmount,
                minTokenOutAmount,
                {
                    value: routeOutput.nativeSend[0] ? tokenInAmount : 0,
                }
            );

            return await tx.wait();
        } catch (e: any) {
            console.error({ e });
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }

    static async createUnsignedSwapTransaction(
        fromAddress: string,
        routerAddress: string,
        routeOutput: RouteOutput,
        amountIn: number,
        inTokenDecimals: number,
        outTokenDecimals: number,
        slippageTolerance: number,
    ): Promise<ContractReceipt> {
        try {
            const router = new ethers.Contract(
                routerAddress,
                routerAbi.abi,
            );

            const tokenInAmount = ethers.utils.parseUnits(
                amountIn.toString(),
                inTokenDecimals
            );

            const clippedOutput = Number(
                (routeOutput.output * (100 - slippageTolerance)) / 100
            ).toFixed(outTokenDecimals);

            const minTokenOutAmount = ethers.utils.parseUnits(
                clippedOutput.toString(),
                outTokenDecimals
            );

            return await router.callStatic.anyToAnySwap(
                routeOutput.route.path.map((pool) => pool.orderbook),
                routeOutput.isBuy,
                routeOutput.nativeSend,
                routeOutput.route.tokenIn,
                routeOutput.route.tokenOut,
                tokenInAmount,
                minTokenOutAmount,
                {
                    from: fromAddress,
                    value: routeOutput.nativeSend[0] ? tokenInAmount : 0,
                }
            );
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
