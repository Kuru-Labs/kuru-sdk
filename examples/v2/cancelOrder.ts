import { ethers, BigNumber } from "ethers";
import * as KuruSdk from "../../src";
import * as KuruConfig from "../config.json";

const { rpcUrl, contractAddress } = KuruConfig;

const privateKey = process.env.PRIVATE_KEY as string;

const args = process.argv.slice(2);

(async () => {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    await KuruSdk.OrderCanceler.cancelOrders(
        signer,
        contractAddress,
        args.map((arg) => BigNumber.from(parseInt(arg)))
    );
})();
