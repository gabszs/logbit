ALTER TABLE "integrations" RENAME TO "connections";--> statement-breakpoint
ALTER TABLE "connections" DROP CONSTRAINT "integrations_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "sources" DROP CONSTRAINT "sources_integration_id_integrations_id_fk";
--> statement-breakpoint
DROP INDEX "integrations_organization_id_idx";--> statement-breakpoint
DROP INDEX "integrations_id_idx";--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_integration_id_connections_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_organization_id_idx" ON "connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "connections_id_idx" ON "connections" USING btree ("id");