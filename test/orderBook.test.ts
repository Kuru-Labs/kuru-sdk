import { describe, it, expect } from '@jest/globals';
import { ethers } from 'ethers';
import * as KuruSdk from '../src';
import { WssTradeEvent } from '../src/types';

describe('OrderBook', () => {
    // Mock data
    const mockL2BookData = "0x00000000000000000000000000000000000000000000000000000000002915a1000000000000000000000000000000000000000000000000000000000025544000000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000255dd200000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002570f6000000000000000000000000000000000000000000000000000000000007b4b40000000000000000000000000000000000000000000000000000000000257a8800000000000000000000000000000000000000000000000000000000000f4240";

    const mockVaultParams = [
        "0x7d43103f26323c075B4D983F7F516b21592e2512",
        {"type":"BigNumber","hex":"0x0d49dc7e16fd5bee0e"},
        {"type":"BigNumber","hex":"0x030d40"},
        {"type":"BigNumber","hex":"0x0d4d435e78cdff1805"},
        {"type":"BigNumber","hex":"0x00"},
        {"type":"BigNumber","hex":"0x078e83"},
        {"type":"BigNumber","hex":"0x078d8b"},
        {"type":"BigNumber","hex":"0x0a"}
    ];

    // Update mock provider
    const mockProvider = {
        call: async () => mockVaultParams,
        getNetwork: () => Promise.resolve({ chainId: 1 }),
        getSigner: () => null,
        provider: {
            getNetwork: () => Promise.resolve({ chainId: 1 })
        },
        _isProvider: true,
        // Add any other methods that ethers might call
        getBlockNumber: () => Promise.resolve(1),
        getGasPrice: () => Promise.resolve(ethers.BigNumber.from(1)),
        estimateGas: () => Promise.resolve(ethers.BigNumber.from(1))
    } as any;

    const mockMarketParams = {
        pricePrecision: ethers.BigNumber.from("0x2710"),
        sizePrecision: ethers.BigNumber.from("0x0f4240"),
        baseAssetAddress: "0xf4f7ca3c361cA2B457Ca6AC9E393B2dad5C6b78b",
        baseAssetDecimals: ethers.BigNumber.from("0x12"),
        quoteAssetAddress: "0x34084eAEbe9Cbc209A85FFe22fa387223CDFB3e8",
        quoteAssetDecimals: ethers.BigNumber.from("0x12"),
        tickSize: ethers.BigNumber.from("0x0a"),
        minSize: ethers.BigNumber.from("0x64"),
        maxSize: ethers.BigNumber.from("0xe8d4a51000"),
        takerFeeBps: ethers.BigNumber.from("0x1e"),
        makerFeeBps: ethers.BigNumber.from("0x14")
    };

    it('should correctly fetch and reconcile L2 orderbook', async () => {
        // Get initial L2 book
        const l2Book = await KuruSdk.OrderBook.getL2OrderBook(
            mockProvider,
            "0xcontractAddress",
            mockMarketParams,
            mockL2BookData,
            mockVaultParams
        );

        // Verify initial state
        expect(l2Book.bids[0][0].toFixed(13)).toBe('245.1299404550743');
        expect(l2Book.bids[0][1]).toBe(0.295235);

        // Mock trade event
        const tradeEvent: WssTradeEvent = {
            orderId: 0,
            makerAddress: "0x7d43103f26323c075B4D983F7F516b21592e2512",
            isBuy: false,
            price: "245129940455074295310",
            updatedSize: "395235",
            takerAddress: "0xecc442E88Cd6B71FCcb256A5Fc838AdeE941a97e",
            filledSize: "100000",
            blockNumber: "2685299",
            transactionHash: "0xd22a6fd138d0723a9c8a9b631d2fdbc3b2903cad6b3ce7800e76403784cc7949",
            triggerTime: 100
        };

        // Reconcile trade
        const reconciledBook = KuruSdk.OrderBook.reconcileTradeEvent(l2Book, mockMarketParams, tradeEvent);

        // Verify final state
        expect(reconciledBook.bids[0][0].toFixed(13)).toBe('245.1299404550743');
        expect(reconciledBook.bids[0][1]).toBe(0.195235);

        // Additional checks
        expect(reconciledBook.blockNumber).toBe(parseInt(tradeEvent.blockNumber, 16));
        expect(reconciledBook.bids.length).toBeGreaterThan(0);
    });

    it('should handle empty orderbook', async () => {
        const emptyL2BookData = "0x0000000000000000000000000000000000000000000000000000000000000000";
        const emptyVaultParams = [
            ethers.constants.AddressZero,
            ethers.constants.Zero,
            ethers.constants.Zero,
            ethers.constants.Zero,
            ethers.constants.Zero,
            ethers.constants.Zero,
            ethers.constants.Zero,
            ethers.constants.Zero
        ];

        const l2Book = await KuruSdk.OrderBook.getL2OrderBook(
            mockProvider,
            "0xcontractAddress",
            mockMarketParams,
            emptyL2BookData,
            emptyVaultParams
        );

        expect(l2Book.bids.length).toBe(0);
        expect(l2Book.asks.length).toBe(0);
    });

    it('should correctly decode L2 book data', async () => {
        const l2Book = await KuruSdk.OrderBook.getL2OrderBook(
            mockProvider,
            "0xcontractAddress",
            mockMarketParams,
            mockL2BookData,
            mockVaultParams
        );

        // Log the first few entries for debugging
        console.log("First bid:", l2Book.bids[0]);
        console.log("First ask:", l2Book.asks[0]);

        // Test specific values from the mock L2 book data
        expect(l2Book.blockNumber).toBe(parseInt("2915a1", 16));
        
        // Add more specific checks based on the decoded mockL2BookData
        // You might want to add expectations for specific price levels
        // that you know should be in the mock data
    });
}); 