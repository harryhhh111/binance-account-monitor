CREATE TYPE "public"."transfer_type_enum" AS ENUM('deposit', 'withdrawal');--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"type" "transfer_type_enum" NOT NULL,
	"tx_id" varchar(255) NOT NULL,
	"asset" varchar(20) NOT NULL,
	"amount" numeric(36, 18) NOT NULL,
	"network" varchar(50),
	"address" varchar(255),
	"address_tag" varchar(100),
	"status" varchar(30) NOT NULL,
	"transfer_time" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "transfers_account_type_tx_id_idx" ON "transfers" USING btree ("account_id","type","tx_id");
