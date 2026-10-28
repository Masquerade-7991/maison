ALTER TABLE "orders" ADD COLUMN "analytics_charged_at" timestamp with time zone;--> statement-breakpoint
-- Orders paid before analytics existed are not sent as new purchases when their pages are next viewed.
UPDATE "orders" SET "analytics_charged_at" = coalesce("paid_at", now()) WHERE "status" = 'paid';