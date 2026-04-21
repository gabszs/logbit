CREATE TYPE "public"."source_type" AS ENUM('trace', 'log', 'metric');--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "source_type" NOT NULL,
	"organization_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "integrations_single_default_per_org_uidx";--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "integration_id" uuid;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_sources_organization_id_idx" ON "sources" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "data_sources_integration_id_idx" ON "sources" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX "data_sources_type_idx" ON "sources" USING btree ("type");--> statement-breakpoint
ALTER TABLE "integrations" DROP COLUMN "is_default";