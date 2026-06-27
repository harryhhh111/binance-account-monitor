import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  numeric,
  json,
  integer,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const marketTypeEnum = pgEnum("market_type_enum", ["spot", "futures"]);
export const positionSideEnum = pgEnum("position_side_enum", [
  "BOTH",
  "LONG",
  "SHORT",
]);
export const marginTypeEnum = pgEnum("margin_type_enum", ["isolated", "cross"]);
export const sourceEnum = pgEnum("source_enum", ["spot", "futures"]);
export const alertTypeEnum = pgEnum("alert_type_enum", [
  "balance_change",
  "new_order",
  "order_filled",
  "order_cancelled",
  "position_opened",
  "position_closed",
  "position_added",
  "position_reduced",
  "position_flipped",
  "liquidation_risk",
  "adl_risk",
  "margin_call",
  "reconcile_diff",
  "websocket_disconnect",
  "system",
]);
export const severityEnum = pgEnum("severity_enum", ["info", "warning", "critical"]);
export const streamTypeEnum = pgEnum("stream_type_enum", ["spot", "futures"]);
export const connectionStatusEnum = pgEnum("connection_status_enum", [
  "connected",
  "disconnected",
  "error",
  "reconnecting",
]);

// 账户配置表
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  apiKey: varchar("api_key", { length: 255 }).notNull(),
  apiSecret: varchar("api_secret", { length: 255 }).notNull(),
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// 系统设置表
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  telegramBotToken: varchar("telegram_bot_token", { length: 255 }),
  telegramChatId: varchar("telegram_chat_id", { length: 100 }),
  reconcileIntervalSeconds: integer("reconcile_interval_seconds")
    .notNull()
    .default(300),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// 余额表（现货 + 合约）
export const balances = pgTable(
  "balances",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull(),
    marketType: marketTypeEnum("market_type").notNull(),
    asset: varchar("asset", { length: 20 }).notNull(),
    free: numeric("free", { precision: 36, scale: 18 }).notNull().default("0"),
    locked: numeric("locked", { precision: 36, scale: 18 })
      .notNull()
      .default("0"),
    walletBalance: numeric("wallet_balance", { precision: 36, scale: 18 }),
    crossWalletBalance: numeric("cross_wallet_balance", {
      precision: 36,
      scale: 18,
    }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  table => ({
    uniqueAccountMarketAsset: uniqueIndex(
      "balances_account_market_asset_idx"
    ).on(table.accountId, table.marketType, table.asset),
  })
);

// 订单表
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull(),
    marketType: marketTypeEnum("market_type").notNull(),
    symbol: varchar("symbol", { length: 30 }).notNull(),
    orderId: varchar("order_id", { length: 50 }).notNull(),
    clientOrderId: varchar("client_order_id", { length: 100 }),
    side: varchar("side", { length: 10 }).notNull(),
    type: varchar("type", { length: 30 }).notNull(),
    status: varchar("status", { length: 30 }).notNull(),
    price: numeric("price", { precision: 36, scale: 18 }),
    quantity: numeric("quantity", { precision: 36, scale: 18 }),
    executedQty: numeric("executed_qty", { precision: 36, scale: 18 })
      .notNull()
      .default("0"),
    avgPrice: numeric("avg_price", { precision: 36, scale: 18 }),
    fee: numeric("fee", { precision: 36, scale: 18 }),
    feeAsset: varchar("fee_asset", { length: 20 }),
    eventTime: timestamp("event_time", { mode: "date" }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  table => ({
    uniqueAccountMarketOrder: uniqueIndex("orders_account_market_order_idx").on(
      table.accountId,
      table.marketType,
      table.orderId
    ),
  })
);

// 持仓表（合约）
export const positions = pgTable(
  "positions",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull(),
    symbol: varchar("symbol", { length: 30 }).notNull(),
    positionSide: positionSideEnum("position_side").notNull(),
    positionAmt: numeric("position_amt", {
      precision: 36,
      scale: 18,
    }).notNull(),
    entryPrice: numeric("entry_price", { precision: 36, scale: 18 }),
    breakEvenPrice: numeric("break_even_price", { precision: 36, scale: 18 }),
    unrealizedPnl: numeric("unrealized_pnl", { precision: 36, scale: 18 }),
    marginType: marginTypeEnum("margin_type"),
    isolatedWallet: numeric("isolated_wallet", { precision: 36, scale: 18 }),
    notionalValue: numeric("notional_value", { precision: 36, scale: 18 }),
    liquidationPrice: numeric("liquidation_price", {
      precision: 36,
      scale: 18,
    }),
    leverage: integer("leverage"),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  table => ({
    uniqueAccountSymbolSide: uniqueIndex(
      "positions_account_symbol_side_idx"
    ).on(table.accountId, table.symbol, table.positionSide),
  })
);

// 账户事件表（原始事件存储）
export const accountEvents = pgTable("account_events", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  source: sourceEnum("source").notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  eventTime: timestamp("event_time", { mode: "date" }),
  rawJson: json("raw_json").notNull(),
  processed: integer("processed").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// 告警记录表
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  alertType: alertTypeEnum("alert_type").notNull(),
  severity: severityEnum("severity").notNull().default("info"),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  symbol: varchar("symbol", { length: 30 }),
  details: json("details"),
  sent: integer("sent").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// 连接状态表
export const connectionStatus = pgTable(
  "connection_status",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull(),
    streamType: streamTypeEnum("stream_type").notNull(),
    status: connectionStatusEnum("status").notNull(),
    lastConnectedAt: timestamp("last_connected_at", { mode: "date" }),
    lastDisconnectedAt: timestamp("last_disconnected_at", { mode: "date" }),
    disconnectCount: integer("disconnect_count").notNull().default(0),
    errorMessage: text("error_message"),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  table => ({
    uniqueAccountStream: uniqueIndex("connection_status_account_stream_idx").on(
      table.accountId,
      table.streamType
    ),
  })
);
