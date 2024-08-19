import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as KuruSdk from "../../src";
import * as KuruConfig from "./../config.json";
import csvParser from "csv-parser";

const { rpcUrl, contractAddress } = KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

const speedUpFactor = 5;

interface HistoricData {
    BLOCK_TIMESTAMP: number;
    SWAP_FROM_AMOUNT: number;
    SWAP_FROM_MINT: string;
}

async function main() {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    const marketParams = await KuruSdk.ParamFetcher.getMarketParams(
        provider,
        contractAddress
    );

    let txIndex = 0;
    const historicData: HistoricData[] = [];

    // Read and parse CSV file
    fs.createReadStream(path.resolve(__dirname, "billy_trades.csv"))
        .pipe(csvParser())
        .on("data", (data) => {
            const isBuy =
                data.SWAP_FROM_MINT ===
                "So11111111111111111111111111111111111111112";
            let size = isBuy
                ? parseFloat(parseFloat(data.SWAP_FROM_AMOUNT).toFixed(6))
                : parseFloat(
                      (parseFloat(data.SWAP_FROM_AMOUNT) / 100).toFixed(2)
                  );
            if (!isBuy && size == 0) {
                size = 1;
            }
            historicData.push({
                BLOCK_TIMESTAMP: parseInt(data.BLOCK_TIMESTAMP),
                SWAP_FROM_AMOUNT: size,
                SWAP_FROM_MINT: data.SWAP_FROM_MINT
            });
        })
        .on("end", async () => {
            console.log("CSV file successfully processed");

            const startTime = Date.now();
            // Main processing loop
            while (txIndex < historicData.length) {
                console.log(txIndex);
                try {
                    await KuruSdk.IOC.placeMarket(
                        signer,
                        contractAddress,
                        marketParams,
                        {
                            size: historicData[txIndex].SWAP_FROM_AMOUNT,
                            approveTokens: true,
                            isBuy:
                                historicData[txIndex].SWAP_FROM_MINT ===
                                "So11111111111111111111111111111111111111112",
                            fillOrKill: false
                        }
                    );

                    txIndex += 1;
                } catch (error) {
                    console.error(
                        `Transaction failed for index ${txIndex}, retrying...`,
                        error
                    );
                    continue; // Retry the same transaction
                }
            }
        });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
