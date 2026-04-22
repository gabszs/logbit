ALTER TABLE "connections" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
UPDATE "connections" SET "type" = 'cloudflare' WHERE "type" = 'cloudflare_email';--> statement-breakpoint
DELETE FROM "connections" WHERE "type" = 'webhook';--> statement-breakpoint
DROP TYPE "public"."type";--> statement-breakpoint
CREATE TYPE "public"."type" AS ENUM('resend', 'cloudflare', 'clickhouse');--> statement-breakpoint
ALTER TABLE "connections" ALTER COLUMN "type" SET DATA TYPE "public"."type" USING "type"::"public"."type";
