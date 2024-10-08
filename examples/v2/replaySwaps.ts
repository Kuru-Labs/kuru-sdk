import { ethers, BigNumber } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as KuruSdk from "../../src";
import * as KuruConfig from "./../config.json";
import csvParser from "csv-parser";

const { rpcUrl, contractAddress } = KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;


interface HistoricData {
    BLOCK_TIMESTAMP: number;
    SIZE_TO_SWAP: number;
    SWAP_DEETS: string;
}

async function main() {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    provider.pollingInterval = 10;
    const signer = new ethers.Wallet(privateKey, provider);

    const marketParams = await KuruSdk.ParamFetcher.getMarketParams(provider, contractAddress);

    let txIndex = 0;
    const historicData: HistoricData[] = [];

    // Read and parse CSV file
    fs.createReadStream(path.resolve(__dirname, "bruh_token_trades.csv"))
        .pipe(csvParser())
        .on("data", (data) => {
            const isBuy = data.token_bought_symbol === 'BRUH';
            let size = isBuy ? parseFloat((parseFloat(data.token_sold_amount)).toFixed(4)) : parseFloat(parseFloat(data.token_sold_amount).toFixed(10));
            if (!isBuy && size == 0) {
                size = 1;
            }
            historicData.push({
                BLOCK_TIMESTAMP: parseInt(data.BLOCK_TIMESTAMP),
                SIZE_TO_SWAP: size,
                SWAP_DEETS: data.token_bought_symbol
            });
        })
        .on("end", async () => {
            console.log("CSV file successfully processed");
            historicData.reverse();
            // Main processing loop
            while (txIndex < historicData.length) {
                console.log(txIndex,historicData[txIndex].SIZE_TO_SWAP, historicData[txIndex].SWAP_DEETS);
                try {
                    await KuruSdk.IOC.placeMarket(
                        signer,
                        contractAddress,
                        marketParams,
                        {
                            size: historicData[txIndex].SIZE_TO_SWAP,
                            approveTokens: false,
                            isBuy: historicData[txIndex].SWAP_DEETS === 'BRUH',
                            isMargin: false,
                            fillOrKill: false,
                            minAmountOut: BigNumber.from(0),
                            isMargin: false
                        }
                    );
                    txIndex++;
                } catch (error) {
                    console.error(`Transaction failed for index ${txIndex}, retrying...`, error);
                    continue;
                }
            }
        });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});