import WebSocket from "ws";
import EventEmitter from "events";
import type { BinanceEvent } from "@contracts/binance.types";

const SPOT_WS_URL = "wss://stream.binance.com:9443/ws";
const FUTURES_WS_URL = "wss://fstream.binance.com/ws";

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

  // Callbacks for listenKey management
  private callbacks: {
    createSpotListenKey: () => Promise<string>;
    keepaliveSpotListenKey: (key: string) => Promise<void>;
    createFuturesListenKey: () => Promise<string>;
    keepaliveFuturesListenKey: (key: string) => Promise<void>;
  };

  constructor(
    accountId: number,
    callbacks: {
      createSpotListenKey: () => Promise<string>;
      keepaliveSpotListenKey: (key: string) => Promise<void>;
      createFuturesListenKey: () => Promise<string>;
      keepaliveFuturesListenKey: (key: string) => Promise<void>;
    }
  ) {
    super();
    this.accountId = accountId;
    this.callbacks = callbacks;
  }

  // ========== Spot WebSocket ==========

  async connectSpot(): Promise<void> {
    try {
      this.spotConnection.listenKey =
        await this.callbacks.createSpotListenKey();
      const url = `${SPOT_WS_URL}/${this.spotConnection.listenKey}`;
      this.spotConnection.ws = new WebSocket(url);
      this.setupSpotHandlers();
    } catch (err) {
      this.emit("error", {
        accountId: this.accountId,
        stream: "spot",
        error: (err as Error).message,
      });
      this.scheduleReconnect("spot");
    }
  }

  private setupSpotHandlers(): void {
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

  // ========== Keepalive ==========

  private startKeepalive(stream: "spot" | "futures"): void {
    const conn = stream === "spot" ? this.spotConnection : this.futuresConnection;
    const keepaliveFn =
      stream === "spot"
        ? this.callbacks.keepaliveSpotListenKey
        : this.callbacks.keepaliveFuturesListenKey;

    // Keepalive every 30 minutes (listenKey expires in 60 minutes)
    conn.keepaliveInterval = setInterval(async () => {
      try {
        await keepaliveFn(conn.listenKey);
      } catch (err) {
        this.emit("keepalive_error", {
          accountId: this.accountId,
          stream,
          error: (err as Error).message,
        });
        // If keepalive fails, recreate listenKey
        try {
          if (stream === "spot") {
            conn.listenKey = await this.callbacks.createSpotListenKey();
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

  private stopKeepalive(stream: "spot" | "futures"): void {
    const conn = stream === "spot" ? this.spotConnection : this.futuresConnection;
    if (conn.keepaliveInterval) {
      clearInterval(conn.keepaliveInterval);
      conn.keepaliveInterval = null;
    }
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
