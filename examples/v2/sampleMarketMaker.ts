// SDK Imports
import * as KuruSdk from "../../src";
import { BATCH, LIMIT } from "../../src/types/order";
import { log10BigNumber } from "../../src/utils/math";
import { MarginBalance } from "../../src/margin/balance";
import { MarketParams } from "../../src/types";

import dotenv from "dotenv";
dotenv.config();

// Config
import * as KuruConfig from "../config.json";

// External Modules
import { ethers } from "ethers";
import fetch from 'cross-fetch';
import { io, Socket } from 'socket.io-client';

const { rpcUrl, contractAddress } = KuruConfig;
const privateKey = process.env.PRIVATE_KEY as string;

const BINANCE_API_URL = "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT";

// Global state management
let activeOrderIds: BigInt[] = [];  // Tracks currently active order IDs
let currentNonce: number = 0;          // Manages transaction nonce
let currentGasPrice: BigInt | undefined = undefined;

const LOG_LEVELS = {
    INFO: 'INFO',
    ERROR: 'ERROR',
    DEBUG: 'DEBUG'
} as const;

function log(level: keyof typeof LOG_LEVELS, message: string) {
    if (level === 'ERROR') {
        console.error(`[${level}] ${message}`);
    } else if (level === 'INFO') {
        console.log(`[${level}] ${message}`);
    } else if (process.env.DEBUG) {
        console.log(`[${level}] ${message}`);
    }
}

interface InventoryBalance {
    baseBalance: number;
    quoteBalance: number;
}

let currentInventory: InventoryBalance = {
    baseBalance: 0,
    quoteBalance: 0
};

// Nonce management functions
// Synchronizes the nonce with the blockchain state
async function syncNonce(signer: ethers.Wallet) {
    currentNonce = await signer.getNonce();
    log('DEBUG', `Nonce synced to: ${currentNonce}`);
}

function getAndIncrementNonce(): number {
    return currentNonce++;
}

interface TradeInfo {
    orderId: bigint;
    filledSize: bigint;
    price: bigint;
    isBuy: boolean;
}

// Event parsing functions
async function parseEvents(receipt: ethers.TransactionReceipt): Promise<{
    newOrderIds: bigint[];
    trades: TradeInfo[];
}> {
    const newOrderIds: BigInt[] = [];
    const trades: TradeInfo[] = [];
    
    receipt.logs.forEach((log) => {
        // Update event parsing for OrderCreated
        if (log.topics[0] === ethers.id("OrderCreated(uint40,address,uint96,uint32,bool)")) {
            try {
                const decodedLog = ethers.AbiCoder.defaultAbiCoder().decode(
                    ['uint40', 'address', 'uint96', 'uint32', 'bool'],
                    log.data
                );
                const orderId = BigInt(decodedLog[0]);
                newOrderIds.push(orderId);
            } catch (error) {
                console.error("Error decoding OrderCreated event:", error);
            }
        }
        // Update event parsing for Trade
        else if (log.topics[0] === ethers.id("Trade(uint40,address,bool,uint256,uint96,address,address,uint96)")) {
            try {
                const decodedLog = ethers.AbiCoder.defaultAbiCoder().decode(
                    ['uint40', 'address', 'bool', 'uint256', 'uint96', 'address', 'address', 'uint96'],
                    log.data
                );
                trades.push({
                    orderId: BigInt(decodedLog[0]),
                    price: BigInt(decodedLog[3]),
                    filledSize: BigInt(decodedLog[7]),
                    isBuy: decodedLog[2]
                });
            } catch (error) {
                console.error("Error decoding trade event:", error);
            }
        }
    });
    
    return { newOrderIds: newOrderIds as bigint[], trades: trades as TradeInfo[] };
}

// Price fetching function
async function getSolPrice() {
    try {
        const response = await fetch(BINANCE_API_URL);
        const data = await response.json();
        return parseFloat(data.price);
    } catch (error) {
        console.error("Error fetching SOL price from Binance:", error);
        throw error;
    }
}

interface TradeEvent {
    orderId: number;
    marketAddress: string;
    makerAddress: string;
    isBuy: boolean;
    price: string;
    updatedSize: string;
    takerAddress: string;
    filledSize: string;
    blockNumber: string;
    txIndex: number;
    logIndex: number;
    transactionHash: string;
    triggerTime: string;
}

// WebSocket order tracking class
class OrderTracker {
    // Maintains WebSocket connection to track order status
    // Handles real-time trade events and order updates
    // Manages active order tracking and cleanup
    private socket: Socket;
    private activeOrders: Set<string> = new Set();
    private readonly signerAddress: string;
    private marketParams: MarketParams | null = null;

    constructor(signerAddress: string) {
        this.signerAddress = signerAddress;
        this.socket = io(`wss://ws.staging.kuru.io?marketAddress=${signerAddress}`);
        this.setupSocketListeners();
    }

    // Add method to set market params
    public setMarketParams(params: MarketParams) {
        this.marketParams = params;
        console.log("Market params set in OrderTracker");
    }

    private setupSocketListeners() {
        this.socket.on('connect', () => {
            log('DEBUG', 'WebSocket connected');
        });

        this.socket.on('Trade', (trade: TradeEvent) => {
            if (trade.marketAddress.toLowerCase() !== contractAddress.toLowerCase()) {
                return;
            }

            if (trade.updatedSize === "0") {
                const orderIdStr = BigInt(trade.orderId).toString();
                if (this.activeOrders.has(orderIdStr)) {
                    this.activeOrders.delete(orderIdStr);
                    activeOrderIds = activeOrderIds.filter(id => 
                        id.toString() !== orderIdStr
                    );
                }
            }
        });

        this.socket.on('disconnect', () => {
            log('DEBUG', 'Disconnected from WebSocket');
        });

        this.socket.on('error', (error) => {
            log('ERROR', `WebSocket error: ${error}`);
        });

        // Add balance update listener
        this.socket.on('BalanceUpdate', (update: {
            owner: string;
            token: string;
            balance: string;
            market: string;
            isBaseAsset: boolean;
            timestamp: string;
        }) => {
            // Verify it's for our signer and market
            if (update.owner.toLowerCase() !== this.signerAddress.toLowerCase() ||
                update.market.toLowerCase() !== contractAddress.toLowerCase() ||
                !this.marketParams) {
                return;
            }

            // Update the appropriate balance
            const balance = BigInt(update.balance);
            if (update.isBaseAsset) {
                currentInventory.baseBalance = parseFloat(
                    ethers.formatUnits(balance, this.marketParams.baseAssetDecimals)
                );
                log('DEBUG', `Base asset balance updated: ${currentInventory.baseBalance}`);
            } else {
                currentInventory.quoteBalance = parseFloat(
                    ethers.formatUnits(balance, this.marketParams.quoteAssetDecimals)
                );
                log('DEBUG', `Quote asset balance updated: ${currentInventory.quoteBalance}`);
            }
        });
    }

    public trackOrders(orderIds: bigint[]) {
        orderIds.forEach(id => {
            this.activeOrders.add(id.toString());
        });
    }

    public disconnect() {
        this.socket.disconnect();
    }
}

// Market parameters management
// Implements caching for market parameters to reduce RPC calls
let cachedMarketParams: any = null;
let lastParamsFetch: number = 0;
const PARAMS_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

async function getMarketParams(provider: ethers.JsonRpcProvider): Promise<any> {
    const now = Date.now();
    
    // Return cached params if they're still valid
    if (cachedMarketParams && (now - lastParamsFetch) < PARAMS_CACHE_DURATION) {
        return cachedMarketParams;
    }

    // Fetch new params
    cachedMarketParams = await KuruSdk.ParamFetcher.getMarketParams(provider, contractAddress);
    lastParamsFetch = now;
    console.log("Market params refreshed at:", new Date().toISOString());
    
    return cachedMarketParams;
}

// Core market making logic
async function updateLimitOrders(
    provider: ethers.JsonRpcProvider,
    signer: ethers.Wallet, 
    basePrice: number, 
    size: number, 
    orderTracker: OrderTracker
) {
    const marketParams = await getMarketParams(provider);
    const BPS_INCREMENT = 0.001;

    try {
        const numCancels = activeOrderIds.length;
        const numNewOrders = 10;

        // Gas limit calculation:
        // Base: 250k for first order, or 75k if no new orders
        // +15k per cancel
        // +100k per additional order (excluding first)
        const baseGas = numNewOrders > 0 ? 250_000 : 75_000;
        const cancelGas = numCancels * 15_000;
        const additionalOrderGas = Math.max(0, numNewOrders - 1) * 100_000;
        const totalGasLimit = baseGas + cancelGas + additionalOrderGas;

        const batchUpdate: BATCH = {
            limitOrders: [],
            cancelOrders: activeOrderIds,
            postOnly: false,
            txOptions: {
                priorityFee: 0.001,
                nonce: getAndIncrementNonce(),
                gasLimit: BigInt(totalGasLimit),
                gasPrice: currentGasPrice
            }
        };

        // Get price precision and tick size
        const pricePrecision = BigInt(marketParams.pricePrecision);
        const tickSize = BigInt(marketParams.tickSize);
        const priceDecimals = log10BigNumber(pricePrecision);
        const tickDecimals = log10BigNumber(tickSize);

        // Create orders...
        for (let i = 0; i < 2; i++) {
            const rawAskPrice = basePrice * (1 + BPS_INCREMENT * (i + 1));
            // First clip to price precision
            const finalAskPrice = Number(rawAskPrice.toFixed(priceDecimals - tickDecimals));

            const askOrder: LIMIT = {
                price: finalAskPrice,
                size,
                isBuy: false,
                postOnly: false
            };
            batchUpdate.limitOrders.push(askOrder);
        }

        for (let i = 0; i < 2; i++) {
            const rawBidPrice = basePrice * (1 - BPS_INCREMENT * (i + 1));
            // First clip to price precision
            const finalBidPrice = Number(rawBidPrice.toFixed(priceDecimals - tickDecimals));

            const bidOrder: LIMIT = {
                price: finalBidPrice,
                size,
                isBuy: true,
                postOnly: false
            };
            batchUpdate.limitOrders.push(bidOrder);
        }

        const receipt = await KuruSdk.OrderBatcher.batchUpdate(
            signer,
            contractAddress,
            marketParams,
            batchUpdate
        );

        // Parse events and update active orders
        const { newOrderIds, trades } = await parseEvents(receipt);
        activeOrderIds = newOrderIds;
        orderTracker.trackOrders(newOrderIds);
        
        // Consolidated logging
        console.log('\n=== Market Making Update ===');
        console.log(`Timestamp: ${new Date().toISOString()}`);
        console.log(`Transaction Hash: ${receipt.hash}`);
        
        console.log('\nMarket State:');
        console.log(`- SOL Price: $${basePrice.toFixed(3)}`);
        console.log(`- Base Balance: ${currentInventory.baseBalance.toFixed(4)} SOL`);
        console.log(`- Quote Balance: $${currentInventory.quoteBalance.toFixed(2)}`);
        
        console.log('\nOrder Updates:');
        console.log(`- Cancelled Orders: ${batchUpdate.cancelOrders.length}`);
        console.log(`- New Orders: ${newOrderIds.length}`);
        
        console.log('\nNew Orders:');
        console.log('Sells:');
        batchUpdate.limitOrders.slice(0, 2).forEach((order, i) => {
            console.log(`  ${i + 1}. ${order.size} SOL @ $${order.price.toFixed(3)}`);
        });
        
        console.log('Buys:');
        batchUpdate.limitOrders.slice(2).forEach((order, i) => {
            console.log(`  ${i + 1}. ${order.size} SOL @ $${order.price.toFixed(3)}`);
        });
        
        if (trades.length > 0) {
            console.log('\nExecuted Trades:');
            trades.forEach(trade => {
                console.log(`- ${trade.isBuy ? 'Buy' : 'Sell'}: ${trade.filledSize.toString()} SOL @ $${trade.price.toString()}`);
            });
        }
        console.log('===========================\n');

    } catch (error) {
        console.error("Error updating limit orders:", error);
    }
}

// Add this new function near syncNonce
async function syncGasPrice(provider: ethers.JsonRpcProvider) {
    try {
        const feeData = await provider.getFeeData();
        currentGasPrice = feeData.gasPrice ?? undefined;
        log('DEBUG', `Gas price synced to: ${ethers.formatUnits(currentGasPrice! as bigint, "gwei")} gwei`);
    } catch (error) {
        log('ERROR', `Error syncing gas price: ${error}`);
    }
}

// Add this new function to fetch and update balances
async function updateInventoryBalances(
    provider: ethers.JsonRpcProvider,
    signer: ethers.Wallet,
    marketParams: MarketParams
) {
    try {
        const [baseBalance, quoteBalance] = await Promise.all([
            MarginBalance.getBalance(
                provider,
                KuruConfig.marginAccountAddress,
                signer.address,
                marketParams.baseAssetAddress
            ),
            MarginBalance.getBalance(
                provider,
                KuruConfig.marginAccountAddress,
                signer.address,
                marketParams.quoteAssetAddress
            )
        ]);

        currentInventory = {
            baseBalance: parseFloat(ethers.formatUnits(baseBalance, marketParams.baseAssetDecimals)),
            quoteBalance: parseFloat(ethers.formatUnits(quoteBalance, marketParams.quoteAssetDecimals))
        };

        log('DEBUG', `Updated inventory - Base: ${currentInventory.baseBalance}, Quote: ${currentInventory.quoteBalance}`);
    } catch (error) {
        log('ERROR', `Error updating inventory balances: ${error}`);
    }
}

async function cancelAllOrders(
    signer: ethers.Wallet,
    marketParams: MarketParams
) {
    if (activeOrderIds.length === 0) {
        log('INFO', 'No active orders to cancel');
        return;
    }

    try {
        const batchUpdate: BATCH = {
            limitOrders: [],
            cancelOrders: activeOrderIds,
            postOnly: false,
            txOptions: {
                priorityFee: 0.001,
                nonce: getAndIncrementNonce(),
                gasLimit: BigInt(85_000 + activeOrderIds.length * 40_000),
                gasPrice: currentGasPrice
            }
        };

        const receipt = await KuruSdk.OrderBatcher.batchUpdate(
            signer,
            contractAddress,
            marketParams,
            batchUpdate
        );

        log('INFO', `Successfully cancelled ${activeOrderIds.length} orders. TX: ${receipt.hash}`);
        activeOrderIds = [];
    } catch (error) {
        log('ERROR', `Failed to cancel orders: ${error}`);
    }
}

// Main market making loop
async function startMarketMaking() {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    
    const orderTracker = new OrderTracker(signer.address);

    // Get initial market params and set them in the tracker
    const marketParams = await getMarketParams(provider);
    orderTracker.setMarketParams(marketParams);

    // Initial syncs including balance
    await Promise.all([
        syncNonce(signer),
        syncGasPrice(provider),
        updateInventoryBalances(provider, signer, marketParams)
    ]);

    // Sync nonce, gas price, and balances every 3 seconds
    setInterval(async () => {
        await Promise.all([
            syncNonce(signer),
            syncGasPrice(provider),
            updateInventoryBalances(provider, signer, marketParams)
        ]);
    }, 3000);

    // Execute immediately first
    try {
        const solPrice = await getSolPrice();
        console.log("Initial SOL price:", solPrice);
        console.log("Current active orders:", activeOrderIds.map(id => id.toString()));
        
        const size = 1;
        await updateLimitOrders(provider, signer, solPrice, size, orderTracker);
    } catch (error) {
        console.error("Error in initial market making:", error);
    }

    // Then run market making every 3 seconds
    setInterval(async () => {
        try {
            const solPrice = await getSolPrice();
            console.log("Current SOL price:", solPrice);
            console.log("Current active orders:", activeOrderIds.map(id => id.toString()));
            
            const size = 1;
            await updateLimitOrders(provider, signer, solPrice, size, orderTracker);
        } catch (error) {
            console.error("Error in market making loop:", error);
        }
    }, 6000);

    // Cleanup on process exit
    process.on('SIGINT', async () => {
        log('INFO', 'Shutting down market maker...');
        orderTracker.disconnect();
        
        // Cancel all outstanding orders before exit
        await cancelAllOrders(signer, marketParams);
        
        log('INFO', 'Market maker shutdown complete');
        process.exit();
    });
}

// Start the market maker
startMarketMaking();
