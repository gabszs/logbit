ALTER TABLE "integrations" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."type";--> statement-breakpoint
CREATE TYPE "public"."type" AS ENUM('webhook', 'cloudflare_email', 'resend');--> statement-breakpoint
ALTER TABLE "integrations" ALTER COLUMN "type" SET DATA TYPE "public"."type" USING "type"::"public"."type";--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_single_default_per_org_uidx" ON "integrations" USING btree ("organization_id") WHERE "integrations"."is_default" = true;