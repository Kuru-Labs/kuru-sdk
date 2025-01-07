import { ethers } from "ethers";

export const getAveragePriceSizeForMarketOrder = (receipt: ethers.TransactionReceipt): {
  averagePrice: bigint;
  size: bigint;
} => {
  const { logs } = receipt;

  let totalSize = BigInt(0);
  let totalPriceSize = BigInt(0);

  for (const log of logs) {
    const data = log.data;

    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
      ["uint40", "address", "bool", "uint256", "uint96", "address", "address", "uint96"],
      data
    );

    const price = decoded[3];
    const size = decoded[7];
    
    totalPriceSize += BigInt(price) * BigInt(size);
    totalSize += BigInt(size);
  }

  return {
    averagePrice: totalPriceSize / totalSize,
    size: totalSize,
  };
}
