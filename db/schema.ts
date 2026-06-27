import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  decimal,
  json,
  tinyint,
  int,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

// 账户配置表
export const accounts = mysqlTable("accounts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  apiKey: varchar("api_key", { length: 255 }).notNull(),
  apiSecret: varchar("api_secret", { length: 255 }).notNull(),
  isActive: tinyint("is_active").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// 系统设置表
export const systemSettings = mysqlTable("system_settings", {
  id: serial("id").primaryKey(),
  telegramBotToken: varchar("telegram_bot_token", { length: 255 }),
  telegramChatId: varchar("telegram_chat_id", { length: 100 }),
  reconcileIntervalSeconds: int("reconcile_interval_seconds").notNull().default(300),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// 余额表（现货 + 合约）
export const balances = mysqlTable("balances", {
  id: serial("id").primaryKey(),
  accountId: int("account_id").notNull(),
  marketType: mysqlEnum("market_type", ["spot", "futures"]).notNull(),
  asset: varchar("asset", { length: 20 }).notNull(),
  free: decimal("free", { precision: 36, scale: 18 }).notNull().default("0"),
  locked: decimal("locked", { precision: 36, scale: 18 }).notNull().default("0"),
  walletBalance: decimal("wallet_balance", { precision: 36, scale: 18 }),
  crossWalletBalance: decimal("cross_wallet_balance", { precision: 36, scale: 18 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// 订单表
export const orders = mysqlTable("orders", {
  id: serial("id").primaryKey(),
  accountId: int("account_id").notNull(),
  marketType: mysqlEnum("market_type", ["spot", "futures"]).notNull(),
  symbol: varchar("symbol", { length: 30 }).notNull(),
  orderId: varchar("order_id", { length: 50 }).notNull(),
  clientOrderId: varchar("client_order_id", { length: 100 }),
  side: varchar("side", { length: 10 }).notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  price: decimal("price", { precision: 36, scale: 18 }),
  quantity: decimal("quantity", { precision: 36, scale: 18 }),
  executedQty: decimal("executed_qty", { precision: 36, scale: 18 }).notNull().default("0"),
  avgPrice: decimal("avg_price", { precision: 36, scale: 18 }),
  fee: decimal("fee", { precision: 36, scale: 18 }),
  feeAsset: varchar("fee_asset", { length: 20 }),
  eventTime: timestamp("event_time"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// 持仓表（合约）
export const positions = mysqlTable("positions", {
  id: serial("id").primaryKey(),
  accountId: int("account_id").notNull(),
  symbol: varchar("symbol", { length: 30 }).notNull(),
  positionSide: mysqlEnum("position_side", ["BOTH", "LONG", "SHORT"]).notNull(),
  positionAmt: decimal("position_amt", { precision: 36, scale: 18 }).notNull(),
  entryPrice: decimal("entry_price", { precision: 36, scale: 18 }),
  breakEvenPrice: decimal("break_even_price", { precision: 36, scale: 18 }),
  unrealizedPnl: decimal("unrealized_pnl", { precision: 36, scale: 18 }),
  marginType: mysqlEnum("margin_type", ["isolated", "cross"]),
  isolatedWallet: decimal("isolated_wallet", { precision: 36, scale: 18 }),
  notionalValue: decimal("notional_value", { precision: 36, scale: 18 }),
  liquidationPrice: decimal("liquidation_price", { precision: 36, scale: 18 }),
  leverage: int("leverage"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// 账户事件表（原始事件存储）
export const accountEvents = mysqlTable("account_events", {
  id: serial("id").primaryKey(),
  accountId: int("account_id").notNull(),
  source: mysqlEnum("source", ["spot", "futures"]).notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  eventTime: timestamp("event_time"),
  rawJson: json("raw_json").notNull(),
  processed: tinyint("processed").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 告警记录表
export const alerts = mysqlTable("alerts", {
  id: serial("id").primaryKey(),
  accountId: int("account_id").notNull(),
  alertType: mysqlEnum("alert_type", [
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
  ]).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).notNull().default("info"),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  symbol: varchar("symbol", { length: 30 }),
  details: json("details"),
  sent: tinyint("sent").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 连接状态表
export const connectionStatus = mysqlTable("connection_status", {
  id: serial("id").primaryKey(),
  accountId: int("account_id").notNull(),
  streamType: mysqlEnum("stream_type", ["spot", "futures"]).notNull(),
  status: mysqlEnum("status", ["connected", "disconnected", "error", "reconnecting"]).notNull(),
  lastConnectedAt: timestamp("last_connected_at"),
  lastDisconnectedAt: timestamp("last_disconnected_at"),
  disconnectCount: int("disconnect_count").notNull().default(0),
  errorMessage: text("error_message"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
