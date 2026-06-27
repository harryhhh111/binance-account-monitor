import axios, { type AxiosInstance } from "axios";
import crypto from "crypto";
import type {
  BinanceBalance,
  BinanceFuturesBalance,
  BinanceFuturesPosition,
  BinanceOrder,
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

  async getSpotBalances(): Promise<BinanceBalance[]> {
    const timestamp = Date.now();
    const params: Record<string, string | number> = { timestamp };
    const signature = this.sign(params, this.credentials.apiSecret);
    const res = await this.spotClient.get("/api/v3/account", {
      params: { ...params, signature },
    });
    return res.data.balances.filter(
      (b: BinanceBalance) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
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
}
