const contractErrorsMap = {
    "0xbb55fd27": "InsufficientLiquidity()",
    "0x3cd146b1": "InvalidSpread()",
    "0xff633a38": "LengthMismatch()",
    "0xa9269545": "MarketFeeError()",
    "0x004b65ba": "MarketStateError()",
    "0xfd993161": "NativeAssetInsufficient()",
    "0xead59376": "NativeAssetNotRequired()",
    "0x70d7ec56": "NativeAssetTransferFail()",
    "0xa0cdd781": "OnlyOwnerAllowedError()",
    "0x829f7240": "OrderAlreadyFilledOrCancelled()",
    "0x06e6da4d": "PostOnlyError()",
    "0x91f53656": "PriceError()",
    "0x0a5c4f1f": "SizeError()",
    "0x8199f5f3": "SlippageExceeded()",
    "0x272d3bf7": "TickSizeError()",
    "0x0b252431": "TooMuchSizeFilled()",
    "0x7939f424": "TransferFromFailed()",
};

export function extractErrorMessage(jsonString: string): Error {
    try {
        console.log({ jsonString });

        // Check for contract error codes
        for (const [errorCode, errorString] of Object.entries(
            contractErrorsMap
        )) {
            if (jsonString.includes(errorCode)) {
                return new Error(errorString);
            }
        }

        // If no contract error code matched, check for "execution reverted" message
        const match = jsonString.match(/execution reverted: (.*)/);
        if (match && match[1]) {
            return new Error(match[1]);
        }

        return new Error("Unknown error");
    } catch (e) {
        console.error(e);
        return new Error("Invalid JSON string");
    }
}
