import { describe, it, expect, vi, beforeEach } from "vitest";
import { BinanceRestClient } from "./binance-rest";
import type {
  BinanceDeposit,
  BinanceWithdrawal,
} from "@contracts/binance.types";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock("axios", () => ({
  default: {
    create: () => ({
      get: mockGet,
      post: mockPost,
      put: mockPut,
      delete: mockDelete,
    }),
  },
}));

function setupSpotResponse(data: unknown) {
  mockGet.mockResolvedValue({ data });
}

function captureSpotParams() {
  return mockGet.mock.calls[mockGet.mock.calls.length - 1][1] as {
    params: Record<string, string | number>;
  };
}

describe("BinanceRestClient deposit/withdrawal methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getDeposits calls /sapi/v1/capital/deposit/hisrec with time range", async () => {
    const deposits: BinanceDeposit[] = [
      {
        amount: "1.5",
        coin: "BTC",
        network: "BTC",
        status: 1,
        address: "addr",
        addressTag: "",
        txId: "tx1",
        insertTime: 1700000000000,
        confirmTimes: "3/3",
        unlockConfirm: 3,
      },
    ];
    setupSpotResponse(deposits);

    const client = new BinanceRestClient({
      apiKey: "key",
      apiSecret: "secret",
    });

    const result = await client.getDeposits({
      startTime: 1700000000000,
      endTime: 1700086400000,
    });

    expect(result).toEqual(deposits);
    expect(mockGet).toHaveBeenCalledWith(
      "/sapi/v1/capital/deposit/hisrec",
      expect.any(Object)
    );
    const params = captureSpotParams().params;
    expect(params.startTime).toBe(1700000000000);
    expect(params.endTime).toBe(1700086400000);
    expect(params.timestamp).toBeTypeOf("number");
    expect(params.signature).toBeTypeOf("string");
  });

  it("getWithdrawals calls /sapi/v1/capital/withdraw/history with time range", async () => {
    const withdrawals: BinanceWithdrawal[] = [
      {
        id: "w1",
        amount: "0.5",
        transactionFee: "0.0001",
        coin: "ETH",
        status: 6,
        address: "addr",
        addressTag: "",
        txId: "tx2",
        applyTime: "2023-11-14T12:00:00.000Z",
        network: "ETH",
        completeTime: "2023-11-14T12:05:00.000Z",
      },
    ];
    setupSpotResponse(withdrawals);

    const client = new BinanceRestClient({
      apiKey: "key",
      apiSecret: "secret",
    });

    const result = await client.getWithdrawals({
      startTime: 1700000000000,
      endTime: 1700086400000,
      offset: 0,
      limit: 100,
    });

    expect(result).toEqual(withdrawals);
    expect(mockGet).toHaveBeenCalledWith(
      "/sapi/v1/capital/withdraw/history",
      expect.any(Object)
    );
    const params = captureSpotParams().params;
    expect(params.startTime).toBe(1700000000000);
    expect(params.endTime).toBe(1700086400000);
    expect(params.offset).toBe(0);
    expect(params.limit).toBe(100);
    expect(params.signature).toBeTypeOf("string");
  });

  it("getAllDeposits pages through results until a partial page", async () => {
    const page1: BinanceDeposit[] = Array.from({ length: 1000 }, (_, i) => ({
      amount: "1",
      coin: "BTC",
      network: "BTC",
      status: 1,
      address: "addr",
      addressTag: "",
      txId: `tx-${i}`,
      insertTime: 1700000000000 + i,
      confirmTimes: "1/1",
      unlockConfirm: 1,
    }));
    const page2: BinanceDeposit[] = [
      {
        amount: "2",
        coin: "BTC",
        network: "BTC",
        status: 1,
        address: "addr",
        addressTag: "",
        txId: "tx-last",
        insertTime: 1700001000000,
        confirmTimes: "1/1",
        unlockConfirm: 1,
      },
    ];
    mockGet.mockResolvedValueOnce({ data: page1 });
    mockGet.mockResolvedValueOnce({ data: page2 });

    const client = new BinanceRestClient({
      apiKey: "key",
      apiSecret: "secret",
    });
    const result = await client.getAllDeposits(1700000000000, 1700086400000);

    expect(result).toHaveLength(1001);
    expect(result[1000].txId).toBe("tx-last");
    expect(mockGet).toHaveBeenCalledTimes(2);
    const firstParams = mockGet.mock.calls[0][1] as {
      params: Record<string, string | number>;
    };
    const secondParams = mockGet.mock.calls[1][1] as {
      params: Record<string, string | number>;
    };
    expect(firstParams.params.offset).toBe(0);
    expect(secondParams.params.offset).toBe(1000);
  });

  it("getAllWithdrawals pages through results until an empty page", async () => {
    const page1: BinanceWithdrawal[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `w-${i}`,
      amount: "1",
      transactionFee: "0.0001",
      coin: "ETH",
      status: 6,
      address: "addr",
      addressTag: "",
      txId: `tx-${i}`,
      applyTime: "2023-11-14 12:00:00",
      network: "ETH",
    }));
    mockGet.mockResolvedValueOnce({ data: page1 });
    mockGet.mockResolvedValueOnce({ data: [] });

    const client = new BinanceRestClient({
      apiKey: "key",
      apiSecret: "secret",
    });
    const result = await client.getAllWithdrawals(1700000000000, 1700086400000);

    expect(result).toHaveLength(1000);
    expect(mockGet).toHaveBeenCalledTimes(2);
    const secondParams = mockGet.mock.calls[1][1] as {
      params: Record<string, string | number>;
    };
    expect(secondParams.params.offset).toBe(1000);
  });
});
