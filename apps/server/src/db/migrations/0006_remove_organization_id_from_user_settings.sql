ALTER TABLE "user_settings" DROP CONSTRAINT IF EXISTS "user_settings_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "organization_id";
