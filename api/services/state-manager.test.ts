import { describe, it, expect } from "vitest";
import { StateManager } from "./state-manager";
import type { BinanceDeposit } from "@contracts/binance.types";

describe("StateManager transfer helpers", () => {
  const manager = new StateManager();

  describe("parseBinanceDate", () => {
    it("parses a 'YYYY-MM-DD HH:mm:ss' string as UTC", () => {
      const result = (manager as unknown as { parseBinanceDate(value: string): Date }).parseBinanceDate("2023-11-14 12:00:00");
      expect(result.toISOString()).toBe("2023-11-14T12:00:00.000Z");
    });

    it("parses a numeric timestamp", () => {
      const result = (manager as unknown as { parseBinanceDate(value: number): Date }).parseBinanceDate(1700000000000);
      expect(result.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    });

    it("returns null for empty/undefined input", () => {
      const helper = (manager as unknown as { parseBinanceDate(value?: string): Date | null }).parseBinanceDate;
      expect(helper("")).toBeNull();
      expect(helper(undefined as unknown as string)).toBeNull();
    });
  });

  describe("depositStatusText", () => {
    it("maps documented Binance deposit statuses accurately", () => {
      const helper = (manager as unknown as { depositStatusText(status: number): string }).depositStatusText;
      expect(helper(0)).toBe("pending");
      expect(helper(1)).toBe("success");
      expect(helper(6)).toBe("credited_but_cannot_withdraw");
      expect(helper(7)).toBe("wrong_deposit");
      expect(helper(8)).toBe("waiting_user_confirm");
      expect(helper(99)).toBe("99");
    });
  });

  describe("withdrawalStatusText", () => {
    it("maps documented Binance withdrawal statuses accurately", () => {
      const helper = (manager as unknown as { withdrawalStatusText(status: number): string }).withdrawalStatusText;
      expect(helper(0)).toBe("email_sent");
      expect(helper(1)).toBe("cancelled");
      expect(helper(2)).toBe("awaiting_approval");
      expect(helper(3)).toBe("rejected");
      expect(helper(4)).toBe("processing");
      expect(helper(5)).toBe("failure");
      expect(helper(6)).toBe("completed");
      expect(helper(99)).toBe("99");
    });
  });

  describe("makeDepositTxId", () => {
    it("prefers txId, then id, then a composite fallback", () => {
      const helper = (manager as unknown as { makeDepositTxId(d: BinanceDeposit): string }).makeDepositTxId;
      const base: BinanceDeposit = {
        amount: "1",
        coin: "BTC",
        network: "BTC",
        status: 1,
        address: "addr",
        addressTag: "",
        txId: "",
        insertTime: 1700000000000,
        confirmTimes: "1/1",
        unlockConfirm: 1,
      };

      expect(helper({ ...base, txId: "tx1" })).toBe("tx1");
      expect(helper({ ...base, txId: "", id: "binance-id-1" })).toBe("binance-id-1");
      expect(helper({ ...base, txId: "", id: undefined })).toBe(
        "DEP-BTC-1700000000000-1"
      );
    });
  });
});
