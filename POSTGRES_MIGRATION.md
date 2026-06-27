# MySQL → PostgreSQL 迁移方案

## 目标

将当前基于 `drizzle-orm/mysql2` 的数据库层迁移到 `drizzle-orm/postgres-js`，以复用 VPS 上已有的 PostgreSQL 实例。

---

## 1. 依赖变更

### 移除

```bash
npm uninstall mysql2
```

### 添加

```bash
npm install postgres
```

> `drizzle-orm` 本身已包含 PostgreSQL 支持，无需额外安装。

---

## 2. 文件修改清单

| 文件 | 修改内容 |
|---|---|
| `package.json` | 移除 `mysql2`，添加 `postgres` |
| `drizzle.config.ts` | `dialect` 改为 `"postgresql"`，驱动改为 postgres |
| `api/queries/connection.ts` | 使用 `drizzle-orm/postgres-js` 连接 |
| `db/schema.ts` | 所有 MySQL 类型改为 PostgreSQL 类型 |
| `db/seed.ts` | 注释中的 MySQL 改为 PostgreSQL |
| `.env.example` | `DATABASE_URL` 示例改为 `postgresql://` |
| `api/services/state-manager.ts` | MySQL 的 `onDuplicateKeyUpdate` 改为 PostgreSQL 的 `onConflictDoUpdate` |
| `db/migrations/` | 删除旧 MySQL 迁移，重新生成 PostgreSQL 迁移 |

---

## 3. 具体修改

### 3.1 `drizzle.config.ts`

**修改前：**

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
```

**修改后：**

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
```

---

### 3.2 `api/queries/connection.ts`

**修改前：**

```ts
import { drizzle } from "drizzle-orm/mysql2";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    instance = drizzle(env.databaseUrl, {
      mode: "planetscale",
      schema: fullSchema,
    });
  }
  return instance;
}
```

**修改后：**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema, typeof postgres>>;

export function getDb() {
  if (!instance) {
    const client = postgres(env.databaseUrl);
    instance = drizzle(client, { schema: fullSchema });
  }
  return instance;
}
```

---

### 3.3 `db/schema.ts`

**修改前：**

```ts
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
```

**修改后：**

```ts
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
} from "drizzle-orm/pg-core";

export const marketTypeEnum = pgEnum("market_type", ["spot", "futures"]);
export const positionSideEnum = pgEnum("position_side", ["BOTH", "LONG", "SHORT"]);
export const marginTypeEnum = pgEnum("margin_type", ["isolated", "cross"]);
export const sourceEnum = pgEnum("source", ["spot", "futures"]);
export const alertTypeEnum = pgEnum("alert_type", [
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
export const severityEnum = pgEnum("severity", ["info", "warning", "critical"]);
export const streamTypeEnum = pgEnum("stream_type", ["spot", "futures"]);
export const connectionStatusEnum = pgEnum("connection_status", [
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
  reconcileIntervalSeconds: integer("reconcile_interval_seconds").notNull().default(300),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// 余额表（现货 + 合约）
export const balances = pgTable("balances", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  marketType: marketTypeEnum("market_type").notNull(),
  asset: varchar("asset", { length: 20 }).notNull(),
  free: numeric("free", { precision: 36, scale: 18 }).notNull().default("0"),
  locked: numeric("locked", { precision: 36, scale: 18 }).notNull().default("0"),
  walletBalance: numeric("wallet_balance", { precision: 36, scale: 18 }),
  crossWalletBalance: numeric("cross_wallet_balance", { precision: 36, scale: 18 }),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// 订单表
export const orders = pgTable("orders", {
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
  executedQty: numeric("executed_qty", { precision: 36, scale: 18 }).notNull().default("0"),
  avgPrice: numeric("avg_price", { precision: 36, scale: 18 }),
  fee: numeric("fee", { precision: 36, scale: 18 }),
  feeAsset: varchar("fee_asset", { length: 20 }),
  eventTime: timestamp("event_time", { mode: "date" }),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// 持仓表（合约）
export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  symbol: varchar("symbol", { length: 30 }).notNull(),
  positionSide: positionSideEnum("position_side").notNull(),
  positionAmt: numeric("position_amt", { precision: 36, scale: 18 }).notNull(),
  entryPrice: numeric("entry_price", { precision: 36, scale: 18 }),
  breakEvenPrice: numeric("break_even_price", { precision: 36, scale: 18 }),
  unrealizedPnl: numeric("unrealized_pnl", { precision: 36, scale: 18 }),
  marginType: marginTypeEnum("margin_type"),
  isolatedWallet: numeric("isolated_wallet", { precision: 36, scale: 18 }),
  notionalValue: numeric("notional_value", { precision: 36, scale: 18 }),
  liquidationPrice: numeric("liquidation_price", { precision: 36, scale: 18 }),
  leverage: integer("leverage"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

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
export const connectionStatus = pgTable("connection_status", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  streamType: streamTypeEnum("stream_type").notNull(),
  status: connectionStatusEnum("status").notNull(),
  lastConnectedAt: timestamp("last_connected_at", { mode: "date" }),
  lastDisconnectedAt: timestamp("last_disconnected_at", { mode: "date" }),
  disconnectCount: integer("disconnect_count").notNull().default(0),
  errorMessage: text("error_message"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});
```

---

### 3.4 `api/services/state-manager.ts`

MySQL 的 `onDuplicateKeyUpdate` 在 PostgreSQL 中要换成 `onConflictDoUpdate`，并指定冲突目标（通常是主键）。

**修改前（以 loadSpotBalances 为例）：**

```ts
await db
  .insert(balances)
  .values({
    accountId,
    marketType: "spot",
    asset: b.asset,
    free: String(free),
    locked: String(locked),
  })
  .onDuplicateKeyUpdate({
    set: {
      free: String(free),
      locked: String(locked),
      updatedAt: new Date(),
    },
  });
```

**修改后：**

```ts
await db
  .insert(balances)
  .values({
    accountId,
    marketType: "spot",
    asset: b.asset,
    free: String(free),
    locked: String(locked),
  })
  .onConflictDoUpdate({
    target: [balances.accountId, balances.marketType, balances.asset],
    set: {
      free: String(free),
      locked: String(locked),
      updatedAt: new Date(),
    },
  });
```

> **注意**：PostgreSQL 的 `onConflictDoUpdate` 必须明确指定 `target`。对于 `balances` 表，唯一冲突键应该是 `(accountId, marketType, asset)`，所以需要在表定义里加上唯一约束：
>
> ```ts
> export const balances = pgTable(
>   "balances",
>   { ... },
>   (table) => ({
>     uniqueAccountMarketAsset: uniqueIndex("balances_account_market_asset_idx").on(
>       table.accountId,
>       table.marketType,
>       table.asset
>     ),
>   })
> );
> ```
>
> 同样，`orders` 表冲突目标应该是 `(accountId, marketType, orderId)`，也需要加唯一约束。

---

### 3.5 `.env.example`

**修改前：**

```bash
DATABASE_URL=             # MySQL connection string (mysql://user:pass@host:port/db)
```

**修改后：**

```bash
DATABASE_URL=             # PostgreSQL connection string (postgresql://user:pass@host:port/db)
```

---

### 3.6 `db/seed.ts`

只是注释调整，无实质改动。

**修改后：**

```ts
import { getDb } from "../api/queries/connection";
// TODO: import tables from "./schema"

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  // TODO: insert seed data, e.g.
  // await db.insert(schema.posts).values([
  //   { title: "First post", content: "Hello world" },
  // ]);

  console.log("Done.");
  process.exit(0); // close PostgreSQL connection pool
}

seed();
```

---

## 4. 关键注意事项

### 4.1 `updated_at` 自动更新

MySQL 的 `.onUpdateNow()` 在 PostgreSQL 中没有等价物。你有三种处理方式：

#### 方式 A：在代码里每次 update 都手动设置 `updatedAt`

例如在 `api/routers/account.ts` 的 update 中：

```ts
await db.update(accounts).set({ ...data, updatedAt: new Date() }).where(eq(accounts.id, id));
```

#### 方式 B：在 PostgreSQL 中创建 trigger（推荐）

建表后执行：

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER system_settings_updated_at BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER balances_updated_at BEFORE UPDATE ON balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER positions_updated_at BEFORE UPDATE ON positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER connection_status_updated_at BEFORE UPDATE ON connection_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### 方式 C：Drizzle 的 `$defaultFn()`

在 schema 里用函数生成，但不能在 update 时自动触发，所以不推荐。

**建议**：方式 B 最省心，和原来 MySQL 的 `onUpdateNow()` 行为一致。

---

### 4.2 唯一约束与 upsert

PostgreSQL 的 `onConflictDoUpdate` 必须基于真实的唯一索引/主键。当前 MySQL 的 `onDuplicateKeyUpdate` 利用了唯一键冲突，但 schema 里没显式定义这些唯一约束。

建议添加以下唯一约束：

- `balances`: `(account_id, market_type, asset)`
- `orders`: `(account_id, market_type, order_id)`
- `system_settings`: 只有一行，可以不加，但建议用 `id = 1`
- `connection_status`: `(account_id, stream_type)`

---

### 4.3 `tinyint` → `integer`

原代码用 `tinyint` 存 0/1。PostgreSQL 没有 `tinyint`（或不需要），统一用 `integer`。

如果你更偏好语义清晰，可以把 `isActive`、`processed`、`sent` 改成 `boolean` 类型，但这样需要把代码里的 `1`/`0` 改成 `true`/`false`。

**推荐**：保持 `integer` 不变，改动最小。

---

### 4.4 `decimal` → `numeric`

Drizzle 在 PostgreSQL 中用 `numeric` 对应 SQL 的 `NUMERIC`。代码中插入时都是 `String(number)`，这部分无需改动。

---

## 5. 迁移执行步骤

1. **改依赖**
   ```bash
   npm uninstall mysql2
   npm install postgres
   ```

2. **改配置文件**
   - `drizzle.config.ts`
   - `api/queries/connection.ts`
   - `db/schema.ts`
   - `api/services/state-manager.ts`
   - `.env.example`
   - `db/seed.ts`

3. **更新 `.env`**
   ```bash
   DATABASE_URL=postgresql://user:password@localhost:5432/binance_monitor
   ```

4. **清理旧迁移**
   ```bash
   rm -rf db/migrations/*
   touch db/migrations/.gitkeep
   ```

5. **生成新迁移**
   ```bash
   npm run db:generate
   ```

6. **执行迁移**
   ```bash
   npm run db:migrate
   ```

7. **创建 updated_at trigger（推荐方式 B）**
   用 `psql` 或任意 PostgreSQL 客户端执行第 4.1 节的 trigger SQL。

8. **验证**
   ```bash
   npm run check
   npm run build
   npm start
   ```

---

## 6. 可选：数据迁移

如果你当前 MySQL 里已经有数据，需要迁移到 PostgreSQL，可以用 `pgloader`：

```bash
pgloader mysql://user:pass@host/mysql_db postgresql://user:pass@host/pg_db
```

但注意枚举类型、JSON 字段、`onUpdateNow` 行为可能需要事后调整。

---

## 7. 总结

迁移不复杂，主要是 Drizzle schema 的类型替换和 upsert 语法调整。最大的坑是：

1. `onUpdateNow()` 没了，需要 trigger 或手动更新。
2. `onDuplicateKeyUpdate` 改成 `onConflictDoUpdate`，需要显式唯一约束。
3. 枚举要先定义再使用。

按上面步骤改完即可在 PostgreSQL 上跑起来。
