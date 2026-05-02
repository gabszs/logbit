import {
	index,
	jsonb,
	pgEnum,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import type { LogsConfigType } from "@/features/sources/logs/schemas";
import { organizations } from "./authModels";
import { connections } from "./connections";

export const sourceTypeEnum = pgEnum("source_type", ["log"]);

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
		connectionId: uuid("integration_id")
			.notNull()
			.references(() => connections.id, { onDelete: "cascade" }),
		config: jsonb("config").$type<LogsConfigType>().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("sources_organization_id_idx").on(table.organizationId),
		index("sources_integration_id_idx").on(table.connectionId),
		index("sources_type_idx").on(table.type),
	],
);
