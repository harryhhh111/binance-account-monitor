import axios, { type AxiosInstance } from "axios";
import crypto from "crypto";
import type {
  BinanceBalance,
  BinanceFuturesBalance,
  BinanceFuturesPosition,
  BinanceOrder,
  BinanceSpotTrade,
  BinanceFuturesTrade,
} from "@contracts/binance.types";

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
}

const SPOT_BASE_URL = "https://api.binance.com";
const FUTURES_BASE_URL = "https://fapi.binance.com";

function createSignature(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

function buildQueryString(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

export class BinanceRestClient {
  private spotClient: AxiosInstance;
  private futuresClient: AxiosInstance;
  private credentials: BinanceCredentials;

  constructor(credentials: BinanceCredentials) {
    this.credentials = credentials;
    this.spotClient = axios.create({
      baseURL: SPOT_BASE_URL,
      headers: { "X-MBX-APIKEY": credentials.apiKey },
      timeout: 10000,
    });
    this.futuresClient = axios.create({
      baseURL: FUTURES_BASE_URL,
      headers: { "X-MBX-APIKEY": credentials.apiKey },
      timeout: 10000,
    });
  }

  private sign(params: Record<string, string | number>, secret: string): string {
    const query = buildQueryString(params);
    return createSignature(query, secret);
  }

  // ========== Spot API ==========

  async createSpotListenKey(): Promise<string> {
    const res = await this.spotClient.post("/api/v3/userDataStream");
    return res.data.listenKey;
  }

  async keepaliveSpotListenKey(listenKey: string): Promise<void> {
    await this.spotClient.put("/api/v3/userDataStream", null, {
      params: { listenKey },
    });
  }

  async deleteSpotListenKey(listenKey: string): Promise<void> {
    await this.spotClient.delete("/api/v3/userDataStream", {
      params: { listenKey },
    });
  }

  async getSpotAccount(): Promise<BinanceBalance[]> {
    const timestamp = Date.now();
    const params: Record<string, string | number> = { timestamp };
    const signature = this.sign(params, this.credentials.apiSecret);
    const res = await this.spotClient.get("/api/v3/account", {
      params: { ...params, signature },
    });
    return res.data.balances;
  }

  async getSpotBalances(): Promise<BinanceBalance[]> {
    const balances = await this.getSpotAccount();
    return balances.filter(
      (b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    );
  }

  async getSpotOpenOrders(): Promise<BinanceOrder[]> {
    const timestamp = Date.now();
    const params: Record<string, string | number> = { timestamp };
    const signature = this.sign(params, this.credentials.apiSecret);
    const res = await this.spotClient.get("/api/v3/openOrders", {
      params: { ...params, signature },
    });
    return res.data;
  }

  // ========== Futures API ==========

  async createFuturesListenKey(): Promise<string> {
    const res = await this.futuresClient.post("/fapi/v1/listenKey");
    return res.data.listenKey;
  }

  async keepaliveFuturesListenKey(listenKey: string): Promise<void> {
    await this.futuresClient.put("/fapi/v1/listenKey", null, {
      params: { listenKey },
    });
  }

  async deleteFuturesListenKey(listenKey: string): Promise<void> {
    await this.futuresClient.delete("/fapi/v1/listenKey", {
      params: { listenKey },
    });
  }

  async getFuturesBalances(): Promise<BinanceFuturesBalance[]> {
    const timestamp = Date.now();
    const params: Record<string, string | number> = { timestamp };
    const signature = this.sign(params, this.credentials.apiSecret);
    const res = await this.futuresClient.get("/fapi/v2/balance", {
      params: { ...params, signature },
    });
    return res.data.filter(
      (b: BinanceFuturesBalance) => parseFloat(b.balance) > 0
    );
  }

  async getFuturesPositions(): Promise<BinanceFuturesPosition[]> {
    const timestamp = Date.now();
    const params: Record<string, string | number> = { timestamp };
    const signature = this.sign(params, this.credentials.apiSecret);
    const res = await this.futuresClient.get("/fapi/v2/positionRisk", {
      params: { ...params, signature },
    });
    return res.data.filter(
      (p: BinanceFuturesPosition) => parseFloat(p.positionAmt) !== 0
    );
  }

  async getFuturesOpenOrders(): Promise<BinanceOrder[]> {
    const timestamp = Date.now();
    const params: Record<string, string | number> = { timestamp };
    const signature = this.sign(params, this.credentials.apiSecret);
    const res = await this.futuresClient.get("/fapi/v1/openOrders", {
      params: { ...params, signature },
    });
    return res.data;
  }

  // ========== Exchange Info ==========

  async getSpotExchangeInfo(): Promise<
    Array<{
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      status: string;
    }>
  > {
    const res = await this.spotClient.get("/api/v3/exchangeInfo");
    return res.data.symbols;
  }

  async getFuturesExchangeInfo(): Promise<
    Array<{
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      status: string;
    }>
  > {
    const res = await this.futuresClient.get("/fapi/v1/exchangeInfo");
    return res.data.symbols;
  }

  // ========== Trade History ==========

  private readonly TRADE_WINDOW_MS = 24 * 60 * 60 * 1000; // Binance max window
  private readonly MIN_TRADE_CHUNK_MS = 60 * 1000;
  private readonly TRADE_PAGE_LIMIT = 1000;

  private async fetchSpotTradesPage(
    symbol: string,
    options: {
      startTime?: number;
      endTime?: number;
      fromId?: number;
      limit?: number;
    }
  ): Promise<BinanceSpotTrade[]> {
    const timestamp = Date.now();
    const params: Record<string, string | number> = {
      symbol,
      timestamp,
      limit: options.limit ?? this.TRADE_PAGE_LIMIT,
    };
    if (options.fromId !== undefined) {
      params.fromId = options.fromId;
    } else {
      params.startTime = options.startTime!;
      params.endTime = options.endTime!;
    }
    const signature = this.sign(params, this.credentials.apiSecret);
    const res = await this.spotClient.get("/api/v3/myTrades", {
      params: { ...params, signature },
    });
    return res.data;
  }

  private async fetchFuturesTradesPage(
    symbol: string,
    options: {
      startTime?: number;
      endTime?: number;
      fromId?: number;
      limit?: number;
    }
  ): Promise<BinanceFuturesTrade[]> {
    const timestamp = Date.now();
    const params: Record<string, string | number> = {
      symbol,
      timestamp,
      limit: options.limit ?? this.TRADE_PAGE_LIMIT,
    };
    if (options.fromId !== undefined) {
      params.fromId = options.fromId;
    } else {
      params.startTime = options.startTime!;
      params.endTime = options.endTime!;
    }
    const signature = this.sign(params, this.credentials.apiSecret);
    const res = await this.futuresClient.get("/fapi/v1/userTrades", {
      params: { ...params, signature },
    });
    return res.data;
  }

  async getAllSpotTrades(
    symbol: string,
    startTime: number,
    endTime: number
  ): Promise<BinanceSpotTrade[]> {
    return this.fetchAllTrades(
      (s, st, et) => this.fetchSpotTradesPage(s, { startTime: st, endTime: et }),
      (s, fromId) => this.fetchSpotTradesPage(s, { fromId }),
      symbol,
      startTime,
      endTime
    );
  }

  async getAllFuturesTrades(
    symbol: string,
    startTime: number,
    endTime: number
  ): Promise<BinanceFuturesTrade[]> {
    return this.fetchAllTrades(
      (s, st, et) =>
        this.fetchFuturesTradesPage(s, { startTime: st, endTime: et }),
      (s, fromId) => this.fetchFuturesTradesPage(s, { fromId }),
      symbol,
      startTime,
      endTime
    );
  }

  private async fetchAllTrades<T extends { id: number; time: number }>(
    fetchByWindow: (
      symbol: string,
      startTime: number,
      endTime: number
    ) => Promise<T[]>,
    fetchByFromId: (symbol: string, fromId: number) => Promise<T[]>,
    symbol: string,
    startTime: number,
    endTime: number
  ): Promise<T[]> {
    const all: T[] = [];
    let windowStart = startTime;

    while (windowStart < endTime) {
      const windowEnd = Math.min(
        windowStart + this.TRADE_WINDOW_MS,
        endTime
      );
      const chunk = await this.fetchTradeWindow(
        fetchByWindow,
        fetchByFromId,
        symbol,
        windowStart,
        windowEnd
      );
      all.push(...chunk);
      windowStart += this.TRADE_WINDOW_MS;
    }

    return all;
  }

  private async fetchTradeWindow<T extends { id: number; time: number }>(
    fetchByWindow: (
      symbol: string,
      startTime: number,
      endTime: number
    ) => Promise<T[]>,
    fetchByFromId: (symbol: string, fromId: number) => Promise<T[]>,
    symbol: string,
    startTime: number,
    endTime: number
  ): Promise<T[]> {
    const page = await fetchByWindow(symbol, startTime, endTime);
    if (page.length < this.TRADE_PAGE_LIMIT) {
      return page;
    }

    // If the window is already very small, paginate by trade id.
    if (endTime - startTime <= this.MIN_TRADE_CHUNK_MS) {
      return this.fetchTradesFromId(
        fetchByFromId,
        symbol,
        startTime,
        endTime,
        page
      );
    }

    // Otherwise split the window and recurse.
    const mid = startTime + Math.floor((endTime - startTime) / 2);
    const left = await this.fetchTradeWindow(
      fetchByWindow,
      fetchByFromId,
      symbol,
      startTime,
      mid
    );
    const right = await this.fetchTradeWindow(
      fetchByWindow,
      fetchByFromId,
      symbol,
      mid,
      endTime
    );
    return [...left, ...right];
  }

  private async fetchTradesFromId<T extends { id: number; time: number }>(
    fetchByFromId: (symbol: string, fromId: number) => Promise<T[]>,
    symbol: string,
    startTime: number,
    endTime: number,
    initialPage: T[]
  ): Promise<T[]> {
    const result: T[] = [...initialPage];
    let fromId = initialPage[initialPage.length - 1].id + 1;

    while (true) {
      const page = await fetchByFromId(symbol, fromId);
      if (page.length === 0) break;

      for (const trade of page) {
        if (trade.time > endTime) return result;
        if (trade.time >= startTime) result.push(trade);
      }

      if (page.length < this.TRADE_PAGE_LIMIT) break;
      fromId = page[page.length - 1].id + 1;
    }

    return result;
  }
}
