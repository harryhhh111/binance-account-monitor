# Binance Account Monitor

实时监控 Binance 账户现货、合约余额、订单、持仓和连接状态的 Web 应用。前端基于 React + Vite，后端基于 Hono + tRPC，数据存储使用 PostgreSQL + Drizzle。

## 功能

- 多 Binance API 账户管理
- 现货和 U 本位合约 User Data Stream 监听
- 余额、订单、持仓快照与周期性对账
- 连接状态、最近事件、告警面板
- Telegram 告警通知
- API Key、API Secret、Telegram Bot Token 服务端加密存储

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

```bash
DATABASE_URL=postgresql://user:password@host:5432/database
SECRETS_KEY=replace-with-a-long-random-string
```

`SECRETS_KEY` 用于加密数据库中的 API 凭据。生产环境必须配置，且上线后不要随意更换，否则历史密文无法解密。

## 开发

```bash
npm install
npm run db:migrate
npm run dev
```

默认开发服务端口是 `3000`。

## 验证

```bash
npm run check
npm run lint
npm test
npm run build
npm audit
```

## 部署

```bash
npm run build
npm start
```

生产启动时会读取数据库中活跃账户并自动启动监控。请确认 API Key 权限、IP 白名单、数据库连接和 Telegram 配置都已经准备好。

## 数据库

迁移文件位于 `db/migrations/`，schema 位于 `db/schema.ts`。

```bash
npm run db:generate
npm run db:migrate
```
