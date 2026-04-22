import {
	index,
	jsonb,
	pgEnum,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./authModels";
import { integrations } from "./integrations";

export const sourceTypeEnum = pgEnum("source_type", ["trace", "log", "metric"]);

export const sources = pgTable(
	"sources",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => Bun.randomUUIDv7()),
		name: varchar("name", { length: 255 }).notNull(),
		type: sourceTypeEnum("type").notNull(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		integrationId: uuid("integration_id")
			.notNull()
			.references(() => integrations.id, { onDelete: "cascade" }),
		config: jsonb("config").$type<Record<string, unknown>>().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("data_sources_organization_id_idx").on(table.organizationId),
		index("data_sources_integration_id_idx").on(table.integrationId),
		index("data_sources_type_idx").on(table.type),
	],
);
