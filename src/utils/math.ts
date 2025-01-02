// ============ External Imports ============

/**
 * @dev Calculates the base-10 logarithm of a BigNumber.
 * @param bn - The BigNumber to calculate the logarithm of.
 * @returns The base-10 logarithm of the BigNumber.
 */
export function log10BigNumber(bn: bigint): number {
    if (bn === BigInt(0)) {
        throw new Error("Log10 of zero is undefined");
    }

    const bnString = bn.toString();
    return bnString.length - 1;
}

export function mulDivRound(
    value: bigint,
    multiplier: bigint,
    divisor: bigint
): bigint {
    const product: bigint = value * multiplier;
    const halfDenominator: bigint = divisor / BigInt(2);
    return (product + halfDenominator) / divisor;
}
