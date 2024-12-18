// ============ External Imports ============
import { ethers } from "ethers";

// ============ Internal Imports ============
import { TransactionOptions } from "src/types";
import { extractErrorMessage } from "../utils";

// ============ Config Imports ============
import routerAbi from "../../abi/Router.json";

export class ParamCreator {
    static async constructDeployMarketTransaction(
        signer: ethers.Signer,
        routerAddress: string,
        type: number,
        baseAssetAddress: string,
        quoteAssetAddress: string,
        sizePrecision: ethers.BigNumber,
        pricePrecision: ethers.BigNumber,
        tickSize: ethers.BigNumber,
        minSize: ethers.BigNumber,
        maxSize: ethers.BigNumber,
        takerFeeBps: number,
        makerFeeBps: number,
        kuruAmmSpread: ethers.BigNumber,
        txOptions?: TransactionOptions
    ): Promise<ethers.providers.TransactionRequest> {
        const address = await signer.getAddress();

        const routerInterface = new ethers.utils.Interface(routerAbi.abi);
        const data = routerInterface.encodeFunctionData("deployProxy", [
            type,
            baseAssetAddress,
            quoteAssetAddress,
            sizePrecision,
            pricePrecision,
            tickSize,
            minSize,
            maxSize,
            takerFeeBps,
            makerFeeBps,
            kuruAmmSpread
        ]);

        const tx: ethers.providers.TransactionRequest = {
            to: routerAddress,
            from: address,
            data,
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

    async deployMarket(
        signer: ethers.Signer,
        routerAddress: string,
        type: number,
        baseAssetAddress: string,
        quoteAssetAddress: string,
        sizePrecision: ethers.BigNumber,
        pricePrecision: ethers.BigNumber,
        tickSize: ethers.BigNumber,
        minSize: ethers.BigNumber,
        maxSize: ethers.BigNumber,
        takerFeeBps: number,
        makerFeeBps: number,
        kuruAmmSpread: ethers.BigNumber,
        txOptions?: TransactionOptions
    ): Promise<string> {
        const router = new ethers.Contract(routerAddress, routerAbi.abi, signer);

        try {
            const tx = await ParamCreator.constructDeployMarketTransaction(
                signer,
                routerAddress,
                type,
                baseAssetAddress,
                quoteAssetAddress,
                sizePrecision,
                pricePrecision,
                tickSize,
                minSize,
                maxSize,
                takerFeeBps,
                makerFeeBps,
                kuruAmmSpread,
                txOptions
            );

            const transaction = await signer.sendTransaction(tx);
            const receipt = await transaction.wait(1);

            const marketRegisteredLog = receipt.logs.find(
                log => {
                    try {
                        const parsedLog = router.interface.parseLog(log);
                        return parsedLog.name === "MarketRegistered";
                    } catch {
                        return false;
                    }
                }
            );
            
            if (!marketRegisteredLog) {
                throw new Error("MarketRegistered event not found in transaction receipt");
            }

            const parsedLog = router.interface.parseLog(marketRegisteredLog);
            return parsedLog.args.market;
        } catch (e: any) {
            console.log({ e });
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }

    calculatePrecisions(quote:number, base:number, maxPrice:number, tickSize:number, minSize:number) {
        const currentPrice = Number((quote / base).toFixed(9));
        if(currentPrice === 0) {
            throw new Error("Current price is too low");
        }
        // const _maxPriceDecimals = Math.floor(Math.log10((10**9) / maxPrice));
        // if(maxPriceDecimals > 9) 
    
        const priceDecimals = Math.max(this.countDecimals(currentPrice), 2, this.countDecimals(tickSize));
        if(priceDecimals > 9) {
            throw new Error("Price is greater than 10**9");
        }
        const pricePrecision = ethers.BigNumber.from(Math.pow(10, priceDecimals));
        const tickSizeString = tickSize.toFixed(priceDecimals);
        const tickSizeInPrecision = ethers.utils.parseUnits(tickSizeString, priceDecimals);
        
        // Calculate size precision based on max price * price precision
        const maxPriceWithPrecision = maxPrice * Math.pow(10, priceDecimals);
        const sizeDecimalsPower = Math.floor(Math.log10(maxPriceWithPrecision));
        const sizeDecimals = Math.max(this.countDecimals(minSize), sizeDecimalsPower);
        const sizePrecision = ethers.BigNumber.from(Math.pow(10, sizeDecimals));

        const maxSizeInPrecision = this.getMaxSizeAtPrice(ethers.utils.parseUnits(
            currentPrice.toFixed(priceDecimals), 
            priceDecimals
        ), ethers.BigNumber.from(sizePrecision));
        const minSizeInPrecision = ethers.utils.parseUnits(minSize.toString(), sizeDecimals);
        return {
            pricePrecision: pricePrecision,
            sizePrecision: sizePrecision,
            tickSize: tickSizeInPrecision,
            minSize: minSizeInPrecision,
            maxSize: maxSizeInPrecision
        }
    }

    getPricePrecision(currentPrice: number, maxPrice: number): { precision: number } | { error: string } {
        const currentDecimals = this.countDecimals(currentPrice);
        const maxDecimals = this.countDecimals(maxPrice);
        
        const neededPrecision = Math.max(currentDecimals, maxDecimals);
        
        if (neededPrecision > 8) {
            return { error: "Price is greater than 10**9" };
        }
        
        return { precision: Math.pow(10, neededPrecision) };
    }

    getSizePrecision(maxPriceInPricePrecision: ethers.BigNumber) : { precision: number } | { error: string } {
        const numDigits = maxPriceInPricePrecision.toString().length;
        
        return { precision: Math.pow(10, numDigits) };
    }

    getMinAndMaxPrice(pricePrecision: number) : { minPrice: number, maxPrice: number } {
        const minPrice = 1 / pricePrecision;
        const maxPrice = 10**9;

        return { minPrice, maxPrice };
    }

    getMaxSizeAtPrice(price: ethers.BigNumber, sizePrecision: ethers.BigNumber) : ethers.BigNumber {
        const UINT32_MAX = ethers.BigNumber.from(2).pow(32).sub(1);
        const rawMaxSize = UINT32_MAX.mul(sizePrecision).div(price);
        // Convert to string to count digits
        const numDigits = rawMaxSize.toString().length;
        
        // Calculate nearest power of 10 (rounding down)
        const maxSize = ethers.BigNumber.from(10).pow(numDigits - 1);
        
        return maxSize;
    }

    calculateMarketCap(price: number, base: number, solPrice: number): string {
        const marketCap = price * base * solPrice * 2;
        
        if (marketCap >= 1_000_000_000) {
            return `${(marketCap / 1_000_000_000).toFixed(1)}b`;
        } else if (marketCap >= 1_000_000) {
            return `${(marketCap / 1_000_000).toFixed(1)}m`;
        } else if (marketCap >= 1_000) {
            return `${(marketCap / 1_000).toFixed(1)}k`;
        }
        return `${marketCap.toFixed(1)}`;
    }
    
    private countDecimals(value: number): number {
        if (value === 0) return 0;
        
        // Convert to string and remove scientific notation
        let str = value.toString();
        if (str.includes('e')) {
            const [_base, exponent] = str.split('e');
            const exp = parseInt(exponent);
            if (exp < 0) {
                // For negative exponents (small decimals)
                return Math.abs(exp);
            } else {
                // For positive exponents (large numbers)
                str = value.toLocaleString('fullwide', {useGrouping: false});
            }
        }
        
        // If no decimal point, return 0
        if (!str.includes('.')) return 0;
        
        // Split on decimal and get length of decimal portion
        const decimalPart = str.split('.')[1];
        return decimalPart ? decimalPart.length : 0;
    }

}