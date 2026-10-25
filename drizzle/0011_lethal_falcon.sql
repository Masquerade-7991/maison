CREATE TYPE "public"."payment_provider" AS ENUM('stripe', 'razorpay');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider" "payment_provider" DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "razorpay_order_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "razorpay_payment_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_razorpayOrderId_unique" UNIQUE("razorpay_order_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_razorpayPaymentId_unique" UNIQUE("razorpay_payment_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_razorpay_inr" CHECK ("orders"."provider" <> 'razorpay' or "orders"."currency" = 'inr');