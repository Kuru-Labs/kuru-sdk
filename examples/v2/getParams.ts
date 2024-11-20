import { ParamCreator } from "../../src/create/params";
import { ethers } from "ethers";

async function main() {
    const paramCreator = new ParamCreator();

    // Test getPricePrecision
    const pricePrecisionTests = [
        { current: 1.23, max: 2.0, expected: { precision: 100 } },
        { current: 0.00123, max: 0.1, expected: { precision: 100000 } },
        { current: 123, max: 200, expected: { precision: 1 } },
        { current: 1.23456789, max: 2.0, expected: { precision: 100000000 } },
        { current: 1.234567891, max: 2.0, expected: { error: "Price is greater than 10**9" } }
    ];

    console.log("Testing getPricePrecision function...\n");

    pricePrecisionTests.forEach((test, index) => {
        console.log(`Test Case ${index + 1}:`);
        console.log(`Current Price: ${test.current}`);
        console.log(`Max Price: ${test.max}`);
        
        const result = paramCreator.getPricePrecision(test.current, test.max);
        console.log(`Result:`, result);
        
        if (JSON.stringify(result) === JSON.stringify(test.expected)) {
            console.log("✅ Test passed");
        } else {
            console.log("❌ Test failed");
            console.log("Expected:", JSON.stringify(test.expected));
            console.log("Result:", JSON.stringify(result));
        }
        console.log("-------------------\n");
    });

    // Test getSizePrecision
    const sizePrecisionTests = [
        { maxPrice: ethers.BigNumber.from("1000"), expected: { precision: 10000 } },
        { maxPrice: ethers.BigNumber.from("1000000"), expected: { precision: 10000000 } }
    ];

    console.log("\nTesting getSizePrecision function...\n");

    sizePrecisionTests.forEach((test, index) => {
        console.log(`Test Case ${index + 1}:`);
        console.log(`Max Price: ${test.maxPrice.toString()}`);
        
        const result = paramCreator.getSizePrecision(test.maxPrice);
        console.log(`Result:`, result);
        
        if (JSON.stringify(result) === JSON.stringify(test.expected)) {
            console.log("✅ Test passed");
        } else {
            console.log("❌ Test failed");
            console.log("Expected:", JSON.stringify(test.expected));
            console.log("Result:", JSON.stringify(result));
        }
        console.log("-------------------\n");
    });

    // Test getMinAndMaxPrice
    const minMaxPriceTests = [
        { pricePrecision: 100, expected: { minPrice: 0.01, maxPrice: 1000000000 } },
        { pricePrecision: 1000, expected: { minPrice: 0.001, maxPrice: 1000000000 } }
    ];

    console.log("\nTesting getMinAndMaxPrice function...\n");

    minMaxPriceTests.forEach((test, index) => {
        console.log(`Test Case ${index + 1}:`);
        console.log(`Price Precision: ${test.pricePrecision}`);
        
        const result = paramCreator.getMinAndMaxPrice(test.pricePrecision);
        console.log(`Result:`, result);
        
        if (JSON.stringify(result) === JSON.stringify(test.expected)) {
            console.log("✅ Test passed");
        } else {
            console.log("❌ Test failed");
            console.log("Expected:", JSON.stringify(test.expected));
            console.log("Result:", JSON.stringify(result));
        }
        console.log("-------------------\n");
    });

    // Test calculateMarketCap
    const marketCapTests = [
        { price: 1.5, base: 1000000, solPrice: 20, expected: "60.0m" },
        { price: 0.5, base: 500000, solPrice: 25, expected: "12.5m" },
        { price: 10, base: 100000000, solPrice: 30, expected: "60.0b" },
        { price: 0.1, base: 1000, solPrice: 15, expected: "3.0k" }
    ];

    console.log("\nTesting calculateMarketCap function...\n");

    marketCapTests.forEach((test, index) => {
        console.log(`Test Case ${index + 1}:`);
        console.log(`Price: ${test.price}, Base: ${test.base}, SOL Price: ${test.solPrice}`);
        
        const result = paramCreator.calculateMarketCap(test.price, test.base, test.solPrice);
        console.log(`Result:`, result);
        
        if (result === test.expected) {
            console.log("✅ Test passed");
        } else {
            console.log("❌ Test failed");
            console.log("Expected:", test.expected);
            console.log("Result:", result);
        }
        console.log("-------------------\n");
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
