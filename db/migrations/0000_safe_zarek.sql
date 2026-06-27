CREATE TYPE "public"."alert_type_enum" AS ENUM('balance_change', 'new_order', 'order_filled', 'order_cancelled', 'position_opened', 'position_closed', 'position_added', 'position_reduced', 'position_flipped', 'liquidation_risk', 'adl_risk', 'margin_call', 'reconcile_diff', 'websocket_disconnect', 'system');--> statement-breakpoint
CREATE TYPE "public"."connection_status_enum" AS ENUM('connected', 'disconnected', 'error', 'reconnecting');--> statement-breakpoint
CREATE TYPE "public"."margin_type_enum" AS ENUM('isolated', 'cross');--> statement-breakpoint
CREATE TYPE "public"."market_type_enum" AS ENUM('spot', 'futures');--> statement-breakpoint
CREATE TYPE "public"."position_side_enum" AS ENUM('BOTH', 'LONG', 'SHORT');--> statement-breakpoint
CREATE TYPE "public"."severity_enum" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."source_enum" AS ENUM('spot', 'futures');--> statement-breakpoint
CREATE TYPE "public"."stream_type_enum" AS ENUM('spot', 'futures');--> statement-breakpoint
CREATE TABLE "account_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"source" "source_enum" NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"event_time" timestamp,
	"raw_json" json NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"api_key" varchar(255) NOT NULL,
	"api_secret" varchar(255) NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"alert_type" "alert_type_enum" NOT NULL,
	"severity" "severity_enum" DEFAULT 'info' NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"symbol" varchar(30),
	"details" json,
	"sent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"market_type" "market_type_enum" NOT NULL,
	"asset" varchar(20) NOT NULL,
	"free" numeric(36, 18) DEFAULT '0' NOT NULL,
	"locked" numeric(36, 18) DEFAULT '0' NOT NULL,
	"wallet_balance" numeric(36, 18),
	"cross_wallet_balance" numeric(36, 18),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"stream_type" "stream_type_enum" NOT NULL,
	"status" "connection_status_enum" NOT NULL,
	"last_connected_at" timestamp,
	"last_disconnected_at" timestamp,
	"disconnect_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"market_type" "market_type_enum" NOT NULL,
	"symbol" varchar(30) NOT NULL,
	"order_id" varchar(50) NOT NULL,
	"client_order_id" varchar(100),
	"side" varchar(10) NOT NULL,
	"type" varchar(30) NOT NULL,
	"status" varchar(30) NOT NULL,
	"price" numeric(36, 18),
	"quantity" numeric(36, 18),
	"executed_qty" numeric(36, 18) DEFAULT '0' NOT NULL,
	"avg_price" numeric(36, 18),
	"fee" numeric(36, 18),
	"fee_asset" varchar(20),
	"event_time" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"symbol" varchar(30) NOT NULL,
	"position_side" "position_side_enum" NOT NULL,
	"position_amt" numeric(36, 18) NOT NULL,
	"entry_price" numeric(36, 18),
	"break_even_price" numeric(36, 18),
	"unrealized_pnl" numeric(36, 18),
	"margin_type" "margin_type_enum",
	"isolated_wallet" numeric(36, 18),
	"notional_value" numeric(36, 18),
	"liquidation_price" numeric(36, 18),
	"leverage" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_bot_token" varchar(255),
	"telegram_chat_id" varchar(100),
	"reconcile_interval_seconds" integer DEFAULT 300 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "balances_account_market_asset_idx" ON "balances" USING btree ("account_id","market_type","asset");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_status_account_stream_idx" ON "connection_status" USING btree ("account_id","stream_type");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_account_market_order_idx" ON "orders" USING btree ("account_id","market_type","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_account_symbol_side_idx" ON "positions" USING btree ("account_id","symbol","position_side");