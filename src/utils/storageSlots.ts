import { ethers } from 'ethers';

/**
 * @dev Calculates the storage slot for a user's token balance within a margin account contract.
 *      This computes the slot used by the margin account to store a specific user's balance for a given token.
 * @param owner - The user address whose balance slot is needed.
 * @param token - The token contract address.
 * @returns Storage slot (keccak hash) for the user's balance entry in the margin account contract.
 */
export function computeBalanceSlotForMarginAccount(owner: string, token: string): string {
    // Inline computeAccountKey since it's only used here
    const accountKey = ethers.utils.keccak256(ethers.utils.solidityPack(['address', 'address'], [owner, token]));
    const slotBytes = ethers.utils.hexZeroPad(ethers.utils.hexlify(ethers.constants.One), 32);
    return ethers.utils.keccak256(
        ethers.utils.concat([ethers.utils.arrayify(accountKey), ethers.utils.arrayify(slotBytes)]),
    );
}
