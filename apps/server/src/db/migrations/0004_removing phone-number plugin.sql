ALTER TABLE "users" DROP CONSTRAINT "users_phone_number_unique";--> statement-breakpoint
DROP INDEX "accounts_user_id_idx";--> statement-breakpoint
DROP INDEX "api_keys_key_idx";--> statement-breakpoint
DROP INDEX "api_keys_user_id_idx";--> statement-breakpoint
DROP INDEX "invitations_organization_id_idx";--> statement-breakpoint
DROP INDEX "members_organization_id_idx";--> statement-breakpoint
DROP INDEX "members_user_id_idx";--> statement-breakpoint
DROP INDEX "sessions_user_id_idx";--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikeys_key_idx" ON "apikeys" USING btree ("key");--> statement-breakpoint
CREATE INDEX "apikeys_userId_idx" ON "apikeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitations_organizationId_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "members_organizationId_idx" ON "members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "members_userId_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "phone_number";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "phone_number_verified";