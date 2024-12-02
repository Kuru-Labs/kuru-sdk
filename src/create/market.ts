import { ethers } from "ethers";

export class ParamCreator {
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
        kuruAmmSpread: ethers.BigNumber
    ): Promise<string> {
        const routerAbi = [
            "function deployProxy(uint8 _type, address _baseAssetAddress, address _quoteAssetAddress, uint96 _sizePrecision, uint32 _pricePrecision, uint32 _tickSize, uint96 _minSize, uint96 _maxSize, uint256 _takerFeeBps, uint256 _makerFeeBps, uint96 _kuruAmmSpread) returns (address proxy)",
            "event MarketRegistered(address baseAsset, address quoteAsset, address market, address vaultAddress, uint32 pricePrecision, uint96 sizePrecision, uint32 tickSize, uint96 minSize, uint96 maxSize, uint256 takerFeeBps, uint256 makerFeeBps)"
        ];

        const router = new ethers.Contract(routerAddress, routerAbi, signer);

        // Get network data in parallel
        const [
            chainId,
            gasPrice,
            nonce
        ] = await Promise.all([
            signer.getChainId(),
            signer.getGasPrice(),
            signer.getTransactionCount()
        ]);

        // Create transaction data manually
        const data = router.interface.encodeFunctionData("deployProxy", [
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

        // Create and sign transaction manually using legacy transaction
        const tx = await signer.sendTransaction({
            to: routerAddress,
            data,
            nonce,
            chainId,
            gasPrice,     // Use gasPrice for legacy transactions
            type: 0       // Legacy transaction type (pre-EIP-1559)
        });

        const receipt = await tx.wait(1);
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
    }

    calculatePrecisions(quote:number, base:number, maxPrice:number, tickSize:number, minSize:number) {
        const currentPrice = Number((quote / base).toFixed(9));
        if(currentPrice === 0) {
            throw new Error("Current price is too low");
        }
        console.log("currentPrice", currentPrice);
        console.log("current price decimals", this.countDecimals(currentPrice));
        // const _maxPriceDecimals = Math.floor(Math.log10((10**9) / maxPrice));
        // if(maxPriceDecimals > 9) 
    
        const priceDecimals = Math.max(this.countDecimals(currentPrice), 2, this.countDecimals(tickSize));
        console.log("priceDecimals", priceDecimals);
        if(priceDecimals > 9) {
            throw new Error("Price is greater than 10**9");
        }
        const pricePrecision = ethers.BigNumber.from(Math.pow(10, priceDecimals));
        console.log("tickSize", tickSize);
        const tickSizeString = tickSize.toFixed(priceDecimals);
        const tickSizeInPrecision = ethers.utils.parseUnits(tickSizeString, priceDecimals);
        console.log("tickSizeInPrecision", tickSizeInPrecision.toString());
        
        // Calculate size precision based on max price * price precision
        const maxPriceWithPrecision = maxPrice * Math.pow(10, priceDecimals);
        const sizeDecimalsPower = Math.floor(Math.log10(maxPriceWithPrecision));
        const sizeDecimals = Math.max(this.countDecimals(minSize), sizeDecimalsPower);
        const sizePrecision = ethers.BigNumber.from(Math.pow(10, sizeDecimals));

        const maxSizeInPrecision = this.getMaxSizeAtPrice(ethers.BigNumber.from(pricePrecision), ethers.BigNumber.from(sizePrecision));
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
        console.log("rawMaxSize", rawMaxSize.toString());
        // Convert to string to count digits
        const numDigits = rawMaxSize.toString().length;
        
        // Calculate nearest power of 10 (rounding down)
        const maxSize = ethers.BigNumber.from(10).pow(numDigits - 1);
        
        return maxSize;
    }

    calculateMarketCap(price: number, base: number, solPrice: number): string {
        const marketCap = price * base * solPrice * 2;
        console.log("marketCap", marketCap);

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