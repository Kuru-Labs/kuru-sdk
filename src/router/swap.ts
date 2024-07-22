// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage, approveToken, estimateApproveGas } from "../utils";
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
    ): Promise<void> {
        try {
            const router = new ethers.Contract(routerAddress, routerAbi.abi, providerOrSigner);
    
            const tokenContract = new ethers.Contract(routeOutput.route.tokenIn, erc20Abi.abi, providerOrSigner);
        
            const tokenInAmount = ethers.utils.parseUnits(
                amountIn.toString(),
                inTokenDecimals
            );
        
            const minTokenOutAmount = ethers.utils.parseUnits(
                (routeOutput.output * (100 - slippageTolerance) / 100).toString(),
                outTokenDecimals
            );
        
            if (approveTokens) {
                await approveToken(
                    tokenContract,
                    routerAddress,
                    tokenInAmount,
                    providerOrSigner
                );
            }
        
            const tx = await router.anyToAnySwap(
                routeOutput.route.path.map(pool => pool.orderbook),
                routeOutput.isBuy,
                routeOutput.nativeSend,
                routeOutput.route.tokenIn,
                routeOutput.route.tokenOut,
                tokenInAmount,
                minTokenOutAmount
            );

            await tx.wait();
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e.error.error.body);
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
        approveTokens: boolean,
    ): Promise<ethers.BigNumber> {
        try {
            const tokenContract = new ethers.Contract(routeOutput.route.tokenIn, erc20Abi.abi, providerOrSigner);
            const tokenInAmount = ethers.utils.parseUnits(amountIn.toString(), inTokenDecimals);

            if (approveTokens) {
                return estimateApproveGas(
                    tokenContract,
                    routerAddress,
                    tokenInAmount
                )
            }

            const router = new ethers.Contract(routerAddress, routerAbi.abi, providerOrSigner);
    
            const minTokenOutAmount = ethers.utils.parseUnits(
                (routeOutput.output * (100 - slippageTolerance) / 100).toString(),
                outTokenDecimals
            );
    
            const gasEstimate = await router.estimateGas.anyToAnySwap(
                routeOutput.route.path.map(pool => pool.orderbook),
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
            throw extractErrorMessage(e.error.error.body);
        }
    }    
}