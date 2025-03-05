import { providers, Signer, utils, BigNumber } from "ethers";
import { TransactionOptions } from "src/types";

export const contructTxGasData = async (
    signer: Signer,
    toAddresss: string,
    fromAddress: string,
    data?: utils.BytesLike,
    txOptions?: TransactionOptions,
    value?: BigNumber
) => {
    const tx: providers.TransactionRequest = {
        to: toAddresss,
        from: fromAddress,
        data,
        ...(txOptions?.nonce !== undefined && { nonce: txOptions.nonce }),
        ...(txOptions?.gasLimit && { gasLimit: txOptions.gasLimit }),
        ...(txOptions?.gasPrice && { gasPrice: txOptions.gasPrice }),
        ...(txOptions?.maxFeePerGas && {
            maxFeePerGas: txOptions.maxFeePerGas,
        }),
        ...(txOptions?.maxPriorityFeePerGas && {
            maxPriorityFeePerGas: txOptions.maxPriorityFeePerGas,
        }),
        ...(value !== undefined && { value }),
    };

    const [gasLimit, baseGasPrice] = await Promise.all([
        !tx.gasLimit
            ? signer.estimateGas({
                  ...tx,
                  gasPrice: utils.parseUnits("1", "gwei"),
              })
            : Promise.resolve(tx.gasLimit),
        !tx.gasPrice && !tx.maxFeePerGas
            ? signer.provider!.getGasPrice()
            : Promise.resolve(undefined),
    ]);

    if (!tx.gasLimit) {
        tx.gasLimit = gasLimit;
    }

    if (!tx.gasPrice && !tx.maxFeePerGas && baseGasPrice) {
        if (txOptions?.priorityFee) {
            const priorityFeeWei = utils.parseUnits(
                txOptions.priorityFee.toString(),
                "gwei"
            );
            tx.gasPrice = baseGasPrice.add(priorityFeeWei);
        } else {
            tx.gasPrice = baseGasPrice;
        }
    }

    return tx;
};
