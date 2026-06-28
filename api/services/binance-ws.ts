import WebSocket from "ws";
import EventEmitter from "events";
import crypto from "crypto";
import type { BinanceEvent } from "@contracts/binance.types";

const SPOT_WS_URL = "wss://stream.binance.com:9443/ws";
const SPOT_WS_API_URL = "wss://ws-api.binance.com/ws-api/v3";
const FUTURES_WS_URL = "wss://fstream.binance.com/ws";

interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
}

interface WSConnection {
  ws: WebSocket | null;
  listenKey: string;
  keepaliveInterval: NodeJS.Timeout | null;
  reconnectAttempts: number;
  status: "connected" | "disconnected" | "reconnecting" | "error";
}

export class BinanceWebSocketManager extends EventEmitter {
  private spotConnection: WSConnection = {
    ws: null,
    listenKey: "",
    keepaliveInterval: null,
    reconnectAttempts: 0,
    status: "disconnected",
  };

  private futuresConnection: WSConnection = {
    ws: null,
    listenKey: "",
    keepaliveInterval: null,
    reconnectAttempts: 0,
    status: "disconnected",
  };

  private maxReconnectDelay = 30000;
  private reconnectDecay = 2;
  private accountId: number;
  private spotCredentials?: BinanceCredentials;

  // Callbacks for listenKey management (futures still uses this)
  private callbacks: {
    createSpotListenKey?: () => Promise<string>;
    keepaliveSpotListenKey?: (key: string) => Promise<void>;
    createFuturesListenKey: () => Promise<string>;
    keepaliveFuturesListenKey: (key: string) => Promise<void>;
  };

  constructor(
    accountId: number,
    callbacks: {
      createSpotListenKey?: () => Promise<string>;
      keepaliveSpotListenKey?: (key: string) => Promise<void>;
      createFuturesListenKey: () => Promise<string>;
      keepaliveFuturesListenKey: (key: string) => Promise<void>;
    },
    spotCredentials?: BinanceCredentials
  ) {
    super();
    this.accountId = accountId;
    this.callbacks = callbacks;
    this.spotCredentials = spotCredentials;
  }

  // ========== Spot WebSocket ==========

  async connectSpot(): Promise<void> {
    if (this.spotCredentials) {
      await this.connectSpotWsApi();
    } else {
      await this.connectSpotLegacy();
    }
  }

  private async connectSpotWsApi(): Promise<void> {
    try {
      this.spotConnection.ws = new WebSocket(SPOT_WS_API_URL);
      this.setupSpotWsApiHandlers();
    } catch (err) {
      this.emit("error", {
        accountId: this.accountId,
        stream: "spot",
        error: (err as Error).message,
      });
      this.scheduleReconnect("spot");
    }
  }

  private async connectSpotLegacy(): Promise<void> {
    try {
      this.spotConnection.listenKey =
        await this.callbacks.createSpotListenKey!();
      const url = `${SPOT_WS_URL}/${this.spotConnection.listenKey}`;
      this.spotConnection.ws = new WebSocket(url);
      this.setupSpotLegacyHandlers();
    } catch (err) {
      this.emit("error", {
        accountId: this.accountId,
        stream: "spot",
        error: (err as Error).message,
      });
      this.scheduleReconnect("spot");
    }
  }

  private setupSpotWsApiHandlers(): void {
    const conn = this.spotConnection;
    if (!conn.ws) return;

    conn.ws.on("open", () => {
      conn.status = "connected";
      conn.reconnectAttempts = 0;
      this.emit("connected", {
        accountId: this.accountId,
        stream: "spot",
      });

      const timestamp = Date.now();
      const query = new URLSearchParams({
        apiKey: this.spotCredentials!.apiKey,
        timestamp: String(timestamp),
      }).toString();
      const signature = crypto
        .createHmac("sha256", this.spotCredentials!.apiSecret)
        .update(query)
        .digest("hex");

      conn.ws!.send(
        JSON.stringify({
          id: timestamp,
          method: "userDataStream.subscribe.signature",
          params: {
            apiKey: this.spotCredentials!.apiKey,
            timestamp,
            signature,
          },
        })
      );

      this.startKeepalive("spot");
    });

    conn.ws.on("message", (data: WebSocket.Data) => {
      try {
        const payload = JSON.parse(data.toString());

        // Handle subscription acks and API responses (e.g. session.ping ack)
        if (
          payload.subscriptionId !== undefined ||
          payload.result !== undefined ||
          payload.error !== undefined
        ) {
          if (payload.error) {
            this.emit("error", {
              accountId: this.accountId,
              stream: "spot",
              error: JSON.stringify(payload.error),
            });
          } else if (payload.result && typeof payload.result === "object") {
            // Capture listenKey returned by userDataStream.subscribe.signature
            if (payload.result.listenKey && typeof payload.result.listenKey === "string") {
              conn.listenKey = payload.result.listenKey;
            }
          }
          return;
        }

        const event = payload as BinanceEvent;
        this.emit("event", {
          accountId: this.accountId,
          stream: "spot",
          event,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit("parse_error", {
          accountId: this.accountId,
          stream: "spot",
          error: message,
          data: data.toString(),
        });
      }
    });

    conn.ws.on("close", (code: number, reason: Buffer) => {
      conn.status = "disconnected";
      this.stopKeepalive("spot");
      this.emit("disconnected", {
        accountId: this.accountId,
        stream: "spot",
        code,
        reason: reason.toString(),
      });
      this.scheduleReconnect("spot");
    });

    conn.ws.on("error", (err: Error) => {
      conn.status = "error";
      this.emit("error", {
        accountId: this.accountId,
        stream: "spot",
        error: err.message,
      });
    });
  }

  private setupSpotLegacyHandlers(): void {
    const conn = this.spotConnection;
    if (!conn.ws) return;

    conn.ws.on("open", () => {
      conn.status = "connected";
      conn.reconnectAttempts = 0;
      this.emit("connected", {
        accountId: this.accountId,
        stream: "spot",
      });
      this.startKeepalive("spot");
    });

    conn.ws.on("message", (data: WebSocket.Data) => {
      try {
        const event = JSON.parse(data.toString()) as BinanceEvent;
        this.emit("event", {
          accountId: this.accountId,
          stream: "spot",
          event,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit("parse_error", {
          accountId: this.accountId,
          stream: "spot",
          error: message,
          data: data.toString(),
        });
      }
    });

    conn.ws.on("close", (code: number, reason: Buffer) => {
      conn.status = "disconnected";
      this.stopKeepalive("spot");
      this.emit("disconnected", {
        accountId: this.accountId,
        stream: "spot",
        code,
        reason: reason.toString(),
      });
      this.scheduleReconnect("spot");
    });

    conn.ws.on("error", (err: Error) => {
      conn.status = "error";
      this.emit("error", {
        accountId: this.accountId,
        stream: "spot",
        error: err.message,
      });
    });
  }

  // ========== Futures WebSocket ==========

  async connectFutures(): Promise<void> {
    try {
      this.futuresConnection.listenKey =
        await this.callbacks.createFuturesListenKey();
      const url = `${FUTURES_WS_URL}/${this.futuresConnection.listenKey}`;
      this.futuresConnection.ws = new WebSocket(url);
      this.setupFuturesHandlers();
    } catch (err) {
      this.emit("error", {
        accountId: this.accountId,
        stream: "futures",
        error: (err as Error).message,
      });
      this.scheduleReconnect("futures");
    }
  }

  private setupFuturesHandlers(): void {
    const conn = this.futuresConnection;
    if (!conn.ws) return;

    conn.ws.on("open", () => {
      conn.status = "connected";
      conn.reconnectAttempts = 0;
      this.emit("connected", {
        accountId: this.accountId,
        stream: "futures",
      });
      this.startKeepalive("futures");
    });

    conn.ws.on("message", (data: WebSocket.Data) => {
      try {
        const event = JSON.parse(data.toString()) as BinanceEvent;
        this.emit("event", {
          accountId: this.accountId,
          stream: "futures",
          event,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit("parse_error", {
          accountId: this.accountId,
          stream: "futures",
          error: message,
          data: data.toString(),
        });
      }
    });

    conn.ws.on("close", (code: number, reason: Buffer) => {
      conn.status = "disconnected";
      this.stopKeepalive("futures");
      this.emit("disconnected", {
        accountId: this.accountId,
        stream: "futures",
        code,
        reason: reason.toString(),
      });
      this.scheduleReconnect("futures");
    });

    conn.ws.on("error", (err: Error) => {
      conn.status = "error";
      this.emit("error", {
        accountId: this.accountId,
        stream: "futures",
        error: err.message,
      });
    });
  }



  private stopKeepalive(stream: "spot" | "futures"): void {
    const conn = stream === "spot" ? this.spotConnection : this.futuresConnection;
    if (conn.keepaliveInterval) {
      clearInterval(conn.keepaliveInterval);
      conn.keepaliveInterval = null;
    }
  }

  // ========== Keepalive ==========

  private startKeepalive(stream: "spot" | "futures"): void {
    const conn = stream === "spot" ? this.spotConnection : this.futuresConnection;

    if (stream === "spot" && this.spotCredentials) {
      // WS-API spot user data stream: keep TCP alive with protocol pings every
      // 30s and send a signed userDataStream.ping every 30 minutes to prevent
      // the stream from expiring (expires after 60 minutes).
      let tickCount = 0;
      conn.keepaliveInterval = setInterval(() => {
        try {
          conn.ws?.ping();
        } catch (err) {
          this.emit("keepalive_error", {
            accountId: this.accountId,
            stream,
            error: `protocol ping failed: ${(err as Error).message}`,
          });
        }

        if (tickCount % 60 === 0) {
          if (!conn.listenKey) {
            this.emit("keepalive_error", {
              accountId: this.accountId,
              stream,
              error: "userDataStream.ping skipped: listenKey not available yet",
            });
          } else {
            try {
              const timestamp = Date.now();
              const query = new URLSearchParams({
                apiKey: this.spotCredentials!.apiKey,
                listenKey: conn.listenKey,
                timestamp: String(timestamp),
              }).toString();
              const signature = crypto
                .createHmac("sha256", this.spotCredentials!.apiSecret)
                .update(query)
                .digest("hex");

              conn.ws?.send(
                JSON.stringify({
                  id: timestamp,
                  method: "userDataStream.ping",
                  params: {
                    apiKey: this.spotCredentials!.apiKey,
                    listenKey: conn.listenKey,
                    timestamp,
                    signature,
                  },
                })
              );
            } catch (err) {
              this.emit("keepalive_error", {
                accountId: this.accountId,
                stream,
                error: `userDataStream.ping failed: ${(err as Error).message}`,
              });
            }
          }
        }

        tickCount++;
      }, 30 * 1000);
      return;
    }

    const keepaliveFn =
      stream === "spot"
        ? this.callbacks.keepaliveSpotListenKey
        : this.callbacks.keepaliveFuturesListenKey;

    // Keepalive every 30 minutes (listenKey expires in 60 minutes)
    conn.keepaliveInterval = setInterval(async () => {
      try {
        await keepaliveFn!(conn.listenKey);
      } catch (err) {
        this.emit("keepalive_error", {
          accountId: this.accountId,
          stream,
          error: (err as Error).message,
        });
        // If keepalive fails, recreate listenKey
        try {
          if (stream === "spot") {
            conn.listenKey = await this.callbacks.createSpotListenKey!();
            this.reconnect(stream);
          } else {
            conn.listenKey = await this.callbacks.createFuturesListenKey();
            this.reconnect(stream);
          }
        } catch (e) {
          this.emit("error", {
            accountId: this.accountId,
            stream,
            error: `Failed to recreate listenKey: ${(e as Error).message}`,
          });
        }
      }
    }, 30 * 60 * 1000); // 30 minutes
  }

  // ========== Reconnection ==========

  private scheduleReconnect(stream: "spot" | "futures"): void {
    const conn = stream === "spot" ? this.spotConnection : this.futuresConnection;
    if (conn.status === "reconnecting") return;

    conn.status = "reconnecting";
    const delay = Math.min(
      1000 * Math.pow(this.reconnectDecay, conn.reconnectAttempts),
      this.maxReconnectDelay
    );
    conn.reconnectAttempts++;

    this.emit("reconnecting", {
      accountId: this.accountId,
      stream,
      attempt: conn.reconnectAttempts,
      delay,
    });

    setTimeout(() => {
      if (stream === "spot") {
        this.connectSpot();
      } else {
        this.connectFutures();
      }
    }, delay);
  }

  // ========== Public Methods ==========

  async connect(): Promise<void> {
    await this.connectSpot();
    await this.connectFutures();
  }

  disconnect(): void {
    this.disconnectStream("spot");
    this.disconnectStream("futures");
  }

  private disconnectStream(stream: "spot" | "futures"): void {
    const conn = stream === "spot" ? this.spotConnection : this.futuresConnection;
    this.stopKeepalive(stream);
    if (conn.ws) {
      conn.ws.removeAllListeners();
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.close();
      }
      conn.ws = null;
    }
    conn.status = "disconnected";
  }

  private reconnect(stream: "spot" | "futures"): void {
    this.disconnectStream(stream);
    if (stream === "spot") {
      this.connectSpot();
    } else {
      this.connectFutures();
    }
  }

  getStatus(): { spot: string; futures: string } {
    return {
      spot: this.spotConnection.status,
      futures: this.futuresConnection.status,
    };
  }
}
