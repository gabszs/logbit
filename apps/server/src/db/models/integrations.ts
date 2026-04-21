import {
	boolean,
	index,
	jsonb,
	pgEnum,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { supportedIntegrationTypes } from "@/integrations/senderFactory";
import { organizations } from "./authModels";

export const integrationTypeEnum = pgEnum("type", supportedIntegrationTypes);

export const integrations = pgTable(
	"integrations",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => Bun.randomUUIDv7()),
		name: varchar("name", { length: 255 }).notNull(),
		type: integrationTypeEnum("type").notNull(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		config: jsonb("config").$type<Record<string, unknown>>().notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		isDefault: boolean("is_default").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("integrations_organization_id_idx").on(table.organizationId),
		index("integrations_id_idx").on(table.id),
		uniqueIndex("integrations_single_default_per_org_uidx")
			.on(table.organizationId)
			.where(sql`${table.isDefault} = true`),
	],
);
