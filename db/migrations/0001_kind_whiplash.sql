CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"market_type" "market_type_enum" NOT NULL,
	"symbol" varchar(30) NOT NULL,
	"trade_id" varchar(50) NOT NULL,
	"order_id" varchar(50),
	"price" numeric(36, 18),
	"qty" numeric(36, 18),
	"quote_qty" numeric(36, 18),
	"commission" numeric(36, 18),
	"commission_asset" varchar(20),
	"side" varchar(10),
	"position_side" varchar(10),
	"is_maker" integer,
	"traded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trades_account_market_trade_idx" ON "trades" USING btree ("account_id","market_type","trade_id");