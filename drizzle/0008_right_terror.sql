CREATE TABLE "fx_rates" (
	"currency" text PRIMARY KEY NOT NULL,
	"per_usd" double precision NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "market" text DEFAULT 'us' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "usd_rate" double precision DEFAULT 1 NOT NULL;