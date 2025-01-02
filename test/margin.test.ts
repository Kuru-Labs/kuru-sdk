import { ethers } from "ethers";
import { MarginDeposit } from "../src/margin/deposit";
import { MarginWithdraw } from "../src/margin/withdraw";
import { MarginBalance } from "../src/margin/balance";

import dotenv from "dotenv";
dotenv.config();

describe("Margin Account Integration Tests", () => {
  // Configuration
  const RPC_ENDPOINT = process.env.RPC_URL!;
  const PRIVATE_KEY = process.env.PK!;
  const MARGIN_ACCOUNT_ADDRESS = "0x33fa695D1B81b88638eEB0a1d69547Ca805b8949";
  const USER_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const TOKEN_ADDRESS = ethers.ZeroAddress;
  const DECIMALS = 18;

  let provider: ethers.JsonRpcProvider;
  let signer: ethers.Wallet;

  beforeAll(() => {
    provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
    signer = new ethers.Wallet(PRIVATE_KEY, provider);
  });

  describe("Deposit Tests", () => {
    it("should successfully deposit ETH", async () => {
      const depositAmount = 0.1; // 0.1 ETH
      
      const initialBalance = await MarginBalance.getBalance(
        provider,
        MARGIN_ACCOUNT_ADDRESS,
        USER_ADDRESS,
        TOKEN_ADDRESS
      );

      const receipt = await MarginDeposit.deposit(
        signer,
        MARGIN_ACCOUNT_ADDRESS,
        USER_ADDRESS,
        TOKEN_ADDRESS,
        depositAmount,
        DECIMALS,
        false // No token approval needed for MON
      );

      expect(receipt.status).toBe(1);

      const finalBalance = await MarginBalance.getBalance(
        provider,
        MARGIN_ACCOUNT_ADDRESS,
        USER_ADDRESS,
        TOKEN_ADDRESS
      );

      const expectedIncrease = ethers.parseUnits(depositAmount.toString(), DECIMALS);
      expect(finalBalance - initialBalance).toBe(expectedIncrease);
    }, 30000); // Increased timeout for blockchain interaction
  });

  describe("Balance Tests", () => {
    it("should return correct balance", async () => {
      const balance = await MarginBalance.getBalance(
        provider,
        MARGIN_ACCOUNT_ADDRESS,
        USER_ADDRESS,
        TOKEN_ADDRESS
      );

      expect(typeof balance).toBe("bigint");
      expect(balance >= BigInt(0)).toBe(true);
    });
  });

  describe("Withdraw Tests", () => {
    it("should successfully withdraw ETH", async () => {
      const withdrawAmount = 0.05; // 0.05 ETH

      const initialBalance = await MarginBalance.getBalance(
        provider,
        MARGIN_ACCOUNT_ADDRESS,
        USER_ADDRESS,
        TOKEN_ADDRESS
      );

      const receipt = await MarginWithdraw.withdraw(
        signer,
        MARGIN_ACCOUNT_ADDRESS,
        TOKEN_ADDRESS,
        withdrawAmount,
        DECIMALS
      );

      expect(receipt.status).toBe(1);

      const finalBalance = await MarginBalance.getBalance(
        provider,
        MARGIN_ACCOUNT_ADDRESS,
        USER_ADDRESS,
        TOKEN_ADDRESS
      );

      const expectedDecrease = ethers.parseUnits(withdrawAmount.toString(), DECIMALS);
      expect(initialBalance - finalBalance).toBe(expectedDecrease);
    }, 30000);
  });

  // Test error cases
  describe("Error Cases", () => {
    it("should fail when trying to withdraw more than balance", async () => {
      const currentBalance = await MarginBalance.getBalance(
        provider,
        MARGIN_ACCOUNT_ADDRESS,
        USER_ADDRESS,
        TOKEN_ADDRESS
      );

      const excessiveAmount = Number(ethers.formatUnits(currentBalance, DECIMALS)) + 1;

      await expect(
        MarginWithdraw.withdraw(
          signer,
          MARGIN_ACCOUNT_ADDRESS,
          TOKEN_ADDRESS,
          excessiveAmount,
          DECIMALS
        )
      ).rejects.toThrow();
    }, 30000);

    it("should fail deposit with insufficient funds", async () => {
      const balance = await signer.provider!.getBalance(signer.address);
      const excessiveAmount = Number(ethers.formatUnits(balance, DECIMALS)) + 1;

      await expect(
        MarginDeposit.deposit(
          signer,
          MARGIN_ACCOUNT_ADDRESS,
          USER_ADDRESS,
          TOKEN_ADDRESS,
          excessiveAmount,
          DECIMALS,
          false
        )
      ).rejects.toThrow();
    }, 30000);
  });
});