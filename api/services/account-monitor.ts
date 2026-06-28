import { BinanceRestClient } from "./binance-rest";
import { BinanceWebSocketManager } from "./binance-ws";
import { StateManager } from "./state-manager";
import { sendTelegramAlert, getBot } from "./telegram-alert";
import { getDb } from "../queries/connection";
import { connectionStatus, systemSettings } from "@db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { ProcessedEvent } from "./event-processor";

export interface MonitorConfig {
  accountId: number;
  name: string;
  apiKey: string;
  apiSecret: string;
}

export class AccountMonitor {
  private restClient: BinanceRestClient;
  private wsManager: BinanceWebSocketManager;
  private stateManager: StateManager;
  private config: MonitorConfig;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: MonitorConfig) {
    this.config = config;
    this.restClient = new BinanceRestClient({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
    });
    this.stateManager = new StateManager();
    this.wsManager = new BinanceWebSocketManager(
      config.accountId,
      {
        createFuturesListenKey: () => this.restClient.createFuturesListenKey(),
        keepaliveFuturesListenKey: (key: string) =>
          this.restClient.keepaliveFuturesListenKey(key),
      },
      {
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
      }
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // WebSocket connected
    this.wsManager.on("connected", async (data) => {
      console.log(
        `[Account ${data.accountId}] ${data.stream} WebSocket connected`
      );
      await this.updateConnectionStatus(data.stream, "connected");
    });

    // WebSocket disconnected
    this.wsManager.on("disconnected", async (data) => {
      console.log(
        `[Account ${data.accountId}] ${data.stream} WebSocket disconnected (code: ${data.code})`
      );
      await this.updateConnectionStatus(data.stream, "disconnected");
    });

    // WebSocket error
    this.wsManager.on("error", async (data) => {
      console.error(
        `[Account ${data.accountId}] ${data.stream} WebSocket error:`,
        data.error
      );
      await this.updateConnectionStatus(data.stream, "error", data.error);
      await this.sendAlert(
        "websocket_disconnect",
        "warning",
        `${data.stream} WebSocket 错误`,
        `账户 ${this.config.name} 的 ${data.stream} WebSocket 发生错误: ${data.error}`,
        undefined,
        { stream: data.stream, error: data.error }
      );
    });

    // WebSocket reconnecting
    this.wsManager.on("reconnecting", (data) => {
      console.log(
        `[Account ${data.accountId}] ${data.stream} WebSocket reconnecting (attempt ${data.attempt}, delay ${data.delay}ms)`
      );
    });

    // Incoming event
    this.wsManager.on("event", async (data) => {
      try {
        const processed = await this.stateManager.processEvent(
          data.accountId,
          data.stream,
          data.event
        );

        if (processed) {
          await this.handleProcessedEvent(processed);
        }
      } catch (err) {
        console.error("Error processing event:", err);
      }
    });
  }

  private async handleProcessedEvent(event: ProcessedEvent): Promise<void> {
    // Handle balance changes
    if (event.balanceChanges && event.balanceChanges.length > 0) {
      for (const change of event.balanceChanges) {
        if (Math.abs(change.free) > 0.000001) {
          await this.sendAlert(
            "balance_change",
            "info",
            `${event.source === "spot" ? "现货" : "合约"}余额变动`,
            `资产: ${change.asset}\n变动: ${change.free > 0 ? "+" : ""}${change.free}`,
            change.asset,
            { ...change, source: event.source }
          );
        }
      }
    }

    // Handle order updates
    if (event.orderUpdate) {
      const ou = event.orderUpdate;
      let alertType: string;
      let title: string;
      let severity: "info" | "warning" = "info";

      switch (ou.status) {
        case "NEW":
          alertType = "new_order";
          title = `新订单 - ${ou.symbol}`;
          break;
        case "PARTIALLY_FILLED":
        case "FILLED":
          alertType = "order_filled";
          title = `订单成交 - ${ou.symbol}`;
          severity = ou.status === "FILLED" ? "info" : "info";
          break;
        case "CANCELED":
          alertType = "order_cancelled";
          title = `订单取消 - ${ou.symbol}`;
          break;
        default:
          alertType = "new_order";
          title = `订单更新 - ${ou.symbol}`;
      }

      const msg = [
        `交易对: ${ou.symbol}`,
        `方向: ${ou.side}`,
        `类型: ${ou.type}`,
        `状态: ${ou.status}`,
        `价格: ${ou.price || "市价"}`,
        `数量: ${ou.executedQty}/${ou.quantity}`,
        `成交均价: ${ou.avgPrice || "-"}`,
        ou.fee ? `手续费: ${ou.fee} ${ou.feeAsset}` : "",
        ou.realizedPnl ? `实现盈亏: ${ou.realizedPnl}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await this.sendAlert(alertType, severity, title, msg, ou.symbol, {
        ...ou,
        source: event.source,
      });
    }

    // Handle position transitions
    if (event.positionTransitions && event.positionTransitions.length > 0) {
      for (const pt of event.positionTransitions) {
        let alertType: string;
        let title: string;
        let severity: "info" | "warning" | "critical" = "info";

        switch (pt.type) {
          case "OPEN":
            alertType = "position_opened";
            title = `开仓 - ${pt.symbol}`;
            break;
          case "ADD":
            alertType = "position_added";
            title = `加仓 - ${pt.symbol}`;
            break;
          case "REDUCE":
            alertType = "position_reduced";
            title = `减仓 - ${pt.symbol}`;
            break;
          case "CLOSE":
            alertType = "position_closed";
            title = `平仓 - ${pt.symbol}`;
            break;
          case "FLIP":
            alertType = "position_flipped";
            title = `反手 - ${pt.symbol}`;
            severity = "warning";
            break;
          default:
            alertType = "position_opened";
            title = `持仓变动 - ${pt.symbol}`;
        }

        const msg = [
          `交易对: ${pt.symbol}`,
          `持仓方向: ${pt.positionSide}`,
          `变动类型: ${pt.type}`,
          `变动数量: ${pt.changeAmount > 0 ? "+" : ""}${pt.changeAmount}`,
          `当前持仓: ${pt.newAmount}`,
          `开仓价: ${pt.entryPrice}`,
          pt.realizedPnl ? `实现盈亏: ${pt.realizedPnl}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        await this.sendAlert(alertType, severity, title, msg, pt.symbol, {
          ...pt,
          source: event.source,
        });
      }
    }

    // Handle margin call
    if (event.marginCall) {
      const mc = event.marginCall;
      const positionsMsg = mc.positions
        .map(
          (p) =>
            `${p.symbol} (${p.positionSide}): 持仓 ${p.positionAmt}, 标记价 ${p.markPrice}, 未实现盈亏 ${p.unrealizedPnl}`
        )
        .join("\n");

      await this.sendAlert(
        "margin_call",
        "critical",
        "⚠️ 保证金警告",
        `全仓钱包余额: ${mc.crossWalletBalance}\n\n持仓:\n${positionsMsg}`,
        undefined,
        mc
      );
    }
  }

  // ========== Public API ==========

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[Account ${this.config.accountId}] Starting monitor...`);

    // 1. Load initial snapshots via REST
    await this.loadSnapshots();

    // 2. Connect WebSocket streams
    await this.wsManager.connect();

    // 3. Start periodic reconciliation
    await this.startReconciliation();

    console.log(`[Account ${this.config.accountId}] Monitor started`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.wsManager.disconnect();
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    console.log(`[Account ${this.config.accountId}] Monitor stopped`);
  }

  private async loadSnapshots(): Promise<void> {
    try {
      // Spot balances
      const spotBalances = await this.restClient.getSpotBalances();
      await this.stateManager.loadSpotBalances(this.config.accountId, spotBalances);
      console.log(
        `[Account ${this.config.accountId}] Loaded ${spotBalances.length} spot balances`
      );
    } catch (err) {
      console.error("Error loading spot balances:", err);
    }

    try {
      // Futures balances
      const futuresBalances = await this.restClient.getFuturesBalances();
      await this.stateManager.loadFuturesBalances(
        this.config.accountId,
        futuresBalances
      );
      console.log(
        `[Account ${this.config.accountId}] Loaded ${futuresBalances.length} futures balances`
      );
    } catch (err) {
      console.error("Error loading futures balances:", err);
    }

    try {
      // Futures positions
      const futuresPositions = await this.restClient.getFuturesPositions();
      await this.stateManager.loadFuturesPositions(
        this.config.accountId,
        futuresPositions
      );
      console.log(
        `[Account ${this.config.accountId}] Loaded ${futuresPositions.length} futures positions`
      );
    } catch (err) {
      console.error("Error loading futures positions:", err);
    }

    try {
      // Spot open orders
      const spotOrders = await this.restClient.getSpotOpenOrders();
      await this.stateManager.loadOrders(
        this.config.accountId,
        "spot",
        spotOrders
      );
      console.log(
        `[Account ${this.config.accountId}] Loaded ${spotOrders.length} spot orders`
      );
    } catch (err) {
      console.error("Error loading spot orders:", err);
    }

    try {
      // Futures open orders
      const futuresOrders = await this.restClient.getFuturesOpenOrders();
      await this.stateManager.loadOrders(
        this.config.accountId,
        "futures",
        futuresOrders
      );
      console.log(
        `[Account ${this.config.accountId}] Loaded ${futuresOrders.length} futures orders`
      );
    } catch (err) {
      console.error("Error loading futures orders:", err);
    }
  }

  private async startReconciliation(): Promise<void> {
    const db = getDb();
    const settings = await db.select().from(systemSettings).limit(1);
    const intervalMs =
      (settings[0]?.reconcileIntervalSeconds || 300) * 1000;

    this.reconcileTimer = setInterval(async () => {
      if (!this.isRunning) return;
      await this.reconcile();
    }, intervalMs);
  }

  async reconcile(): Promise<void> {
    console.log(`[Account ${this.config.accountId}] Running reconciliation...`);

    try {
      // Reconcile spot balances
      const spotBalances = await this.restClient.getSpotBalances();
      const spotDiffs = await this.stateManager.reconcileBalances(
        this.config.accountId,
        "spot",
        spotBalances.map((b) => ({
          asset: b.asset,
          free: parseFloat(b.free),
          locked: parseFloat(b.locked),
        }))
      );

      if (spotDiffs.length > 0) {
        console.log(
          `[Account ${this.config.accountId}] Spot balance diffs:`,
          spotDiffs
        );
        const diffMsg = spotDiffs
          .map((d) => `${d.asset}: 本地=${d.local.toFixed(8)}, 远程=${d.remote.toFixed(8)}, 差异=${d.diff > 0 ? "+" : ""}${d.diff.toFixed(8)}`)
          .join("\n");
        await this.sendAlert(
          "reconcile_diff",
          "warning",
          "现货余额对账差异",
          `发现 ${spotDiffs.length} 个资产余额不一致:\n${diffMsg}`,
          undefined,
          { diffs: spotDiffs }
        );
      }
    } catch (err) {
      console.error("Error reconciling spot balances:", err);
    }

    try {
      // Reconcile futures balances
      const futuresBalances = await this.restClient.getFuturesBalances();
      const futuresDiffs = await this.stateManager.reconcileBalances(
        this.config.accountId,
        "futures",
        futuresBalances.map((b) => ({
          asset: b.asset,
          free: parseFloat(b.availableBalance),
          walletBalance: parseFloat(b.balance),
          crossWalletBalance: parseFloat(b.crossWalletBalance),
        }))
      );

      if (futuresDiffs.length > 0) {
        console.log(
          `[Account ${this.config.accountId}] Futures balance diffs:`,
          futuresDiffs
        );
        const diffMsg = futuresDiffs
          .map((d) => `${d.asset}: 本地=${d.local.toFixed(8)}, 远程=${d.remote.toFixed(8)}, 差异=${d.diff > 0 ? "+" : ""}${d.diff.toFixed(8)}`)
          .join("\n");
        await this.sendAlert(
          "reconcile_diff",
          "warning",
          "合约余额对账差异",
          `发现 ${futuresDiffs.length} 个资产余额不一致:\n${diffMsg}`,
          undefined,
          { diffs: futuresDiffs }
        );
      }
    } catch (err) {
      console.error("Error reconciling futures balances:", err);
    }

    try {
      // Reconcile futures positions
      const remotePositions = await this.restClient.getFuturesPositions();
      const localPositions = await this.stateManager.getPositions(
        this.config.accountId
      );

      const localPosMap = new Map(
        localPositions.map((p) => [
          `${p.symbol}-${p.positionSide}`,
          parseFloat(String(p.positionAmt)),
        ])
      );

      const posDiffs = [];
      for (const rp of remotePositions) {
        const key = `${rp.symbol}-${rp.positionSide}`;
        const localAmt = localPosMap.get(key) || 0;
        const remoteAmt = parseFloat(rp.positionAmt);

        if (Math.abs(localAmt - remoteAmt) > 0.00000001) {
          posDiffs.push({
            symbol: rp.symbol,
            positionSide: rp.positionSide,
            local: localAmt,
            remote: remoteAmt,
          });
        }
      }

      if (posDiffs.length > 0) {
        console.log(
          `[Account ${this.config.accountId}] Position diffs:`,
          posDiffs
        );
        // Reload positions
        await this.stateManager.loadFuturesPositions(
          this.config.accountId,
          remotePositions
        );
        await this.sendAlert(
          "reconcile_diff",
          "warning",
          "持仓对账差异",
          `发现 ${posDiffs.length} 个持仓不一致，已重新同步`,
          undefined,
          { diffs: posDiffs }
        );
      }
    } catch (err) {
      console.error("Error reconciling positions:", err);
    }

    console.log(`[Account ${this.config.accountId}] Reconciliation complete`);
  }

  private async sendAlert(
    alertType: string,
    severity: "info" | "warning" | "critical",
    title: string,
    message: string,
    symbol?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    // Save to database
    await this.stateManager.createAlert(
      this.config.accountId,
      alertType,
      severity,
      title,
      message,
      symbol,
      details
    );

    // Send Telegram
    const db = getDb();
    const settings = await db.select().from(systemSettings).limit(1);
    if (
      settings.length > 0 &&
      settings[0].telegramBotToken &&
      settings[0].telegramChatId
    ) {
      const bot = getBot();
      if (bot) {
        const fullMsg = `账户: ${this.config.name}\n${message}`;
        await sendTelegramAlert(
          bot,
          settings[0].telegramChatId,
          title,
          fullMsg,
          severity
        );
      }
    }
  }

  private async updateConnectionStatus(
    stream: "spot" | "futures",
    status: "connected" | "disconnected" | "error" | "reconnecting",
    errorMessage?: string
  ): Promise<void> {
    const db = getDb();

    const existing = await db
      .select()
      .from(connectionStatus)
      .where(
        and(
          eq(connectionStatus.accountId, this.config.accountId),
          eq(connectionStatus.streamType, stream)
        )
      );

    const now = new Date();
    const updateData: Partial<typeof connectionStatus.$inferInsert> = {
      status,
      updatedAt: now,
    };

    if (status === "connected") {
      updateData.lastConnectedAt = now;
    } else if (status === "disconnected" || status === "error") {
      updateData.lastDisconnectedAt = now;
    }

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    if (existing.length > 0) {
      await db
        .update(connectionStatus)
        .set({
          ...updateData,
          disconnectCount:
            status === "disconnected" || status === "error"
              ? sql`${connectionStatus.disconnectCount} + 1`
              : undefined,
        })
        .where(
          and(
            eq(connectionStatus.accountId, this.config.accountId),
            eq(connectionStatus.streamType, stream)
          )
        );
    } else {
      await db.insert(connectionStatus).values({
        accountId: this.config.accountId,
        streamType: stream,
        status,
        lastConnectedAt: status === "connected" ? now : undefined,
        lastDisconnectedAt:
          status === "disconnected" || status === "error" ? now : undefined,
        errorMessage,
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async syncTransfers(days = 3): Promise<{
    deposits: number;
    withdrawals: number;
  }> {
    const accountId = this.config.accountId;
    const endTime = Date.now();
    const startTime = endTime - days * 24 * 60 * 60 * 1000;
    let depositsCount = 0;
    let withdrawalsCount = 0;

    try {
      const deposits = await this.restClient.getAllDeposits(startTime, endTime);
      if (deposits.length > 0) {
        await this.stateManager.loadDeposits(accountId, deposits);
        depositsCount += deposits.length;
      }
    } catch (err) {
      console.error(
        `[Account ${accountId}] Error syncing deposits:`,
        err
      );
    }

    try {
      const withdrawals = await this.restClient.getAllWithdrawals(
        startTime,
        endTime
      );
      if (withdrawals.length > 0) {
        await this.stateManager.loadWithdrawals(accountId, withdrawals);
        withdrawalsCount += withdrawals.length;
      }
    } catch (err) {
      console.error(
        `[Account ${accountId}] Error syncing withdrawals:`,
        err
      );
    }

    console.log(
      `[Account ${accountId}] Synced ${depositsCount} deposits and ${withdrawalsCount} withdrawals`
    );
    return { deposits: depositsCount, withdrawals: withdrawalsCount };
  }

  async syncTrades(days = 3): Promise<{
    spot: number;
    futures: number;
  }> {
    const accountId = this.config.accountId;
    const endTime = Date.now();
    const startTime = endTime - days * 24 * 60 * 60 * 1000;
    let spotCount = 0;
    let futuresCount = 0;

    const SPOT_QUOTE_ASSETS = ["USDT", "USDC", "FDUSD", "BTC", "ETH", "BNB"];

    try {
      // Spot: use all account assets (including zero-balance assets that may
      // have been sold off) and validate symbols against exchangeInfo.
      const [spotBalances, spotExchangeInfo] = await Promise.all([
        this.restClient.getSpotAccount(),
        this.restClient.getSpotExchangeInfo(),
      ]);

      const activeSpotSymbols = new Set(
        spotExchangeInfo
          .filter((s) => s.status === "TRADING")
          .map((s) => s.symbol)
      );

      const nonZeroAssets = new Set(
        spotBalances
          .filter(
            (b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
          )
          .map((b) => b.asset)
      );

      const candidateSymbols = new Set<string>();
      for (const asset of spotBalances.map((b) => b.asset)) {
        for (const quote of SPOT_QUOTE_ASSETS) {
          if (asset === quote) continue;
          const symbol = `${asset}${quote}`;
          if (
            activeSpotSymbols.has(symbol) &&
            (nonZeroAssets.has(asset) || nonZeroAssets.has(quote))
          ) {
            candidateSymbols.add(symbol);
          }
        }
      }

      for (const symbol of candidateSymbols) {
        try {
          const trades = await this.restClient.getAllSpotTrades(
            symbol,
            startTime,
            endTime
          );
          if (trades.length > 0) {
            await this.stateManager.loadSpotTrades(accountId, trades);
            spotCount += trades.length;
          }
        } catch {
          // Symbol may not be tradable or have no trades; ignore
        }
        await this.sleep(250);
      }
    } catch (err) {
      console.error(
        `[Account ${accountId}] Error syncing spot trades:`,
        err
      );
    }

    try {
      // Futures: discover symbols that actually had account activity from
      // income history, then pull userTrades for those symbols only. This
      // avoids sending thousands of requests to every active USD-M symbol.
      const [futuresExchangeInfo, futuresIncome] = await Promise.all([
        this.restClient.getFuturesExchangeInfo(),
        this.restClient.getFuturesIncomeHistory({
          startTime,
          endTime,
          limit: 1000,
        }),
      ]);

      const activeFuturesSymbols = new Set(
        futuresExchangeInfo
          .filter((s) => s.status === "TRADING")
          .map((s) => s.symbol)
      );

      const tradedSymbols = new Set<string>();
      for (const item of futuresIncome) {
        if (item.symbol && activeFuturesSymbols.has(item.symbol)) {
          tradedSymbols.add(item.symbol);
        }
      }

      for (const symbol of tradedSymbols) {
        try {
          const trades = await this.restClient.getAllFuturesTrades(
            symbol,
            startTime,
            endTime
          );
          if (trades.length > 0) {
            await this.stateManager.loadFuturesTrades(accountId, trades);
            futuresCount += trades.length;
          }
        } catch {
          // Ignore per-symbol errors
        }
        await this.sleep(200);
      }
    } catch (err) {
      console.error(
        `[Account ${accountId}] Error syncing futures trades:`,
        err
      );
    }

    console.log(
      `[Account ${accountId}] Synced ${spotCount} spot trades and ${futuresCount} futures trades`
    );
    return { spot: spotCount, futures: futuresCount };
  }

  getStatus(): { spot: string; futures: string; running: boolean } {
    return {
      ...this.wsManager.getStatus(),
      running: this.isRunning,
    };
  }
}
