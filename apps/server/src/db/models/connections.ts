import {
	boolean,
	index,
	jsonb,
	pgEnum,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { supportedIntegrationTypes } from "@/integrations/factory";
import { organizations } from "./authModels";

export const connectionsTypeEnum = pgEnum("type", supportedIntegrationTypes);

export const connections = pgTable(
	"connections",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => Bun.randomUUIDv7()),
		name: varchar("name", { length: 255 }).notNull(),
		type: connectionsTypeEnum("type").notNull(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		config: jsonb("config").$type<Record<string, unknown>>().notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("connections_organization_id_idx").on(table.organizationId),
		index("connections_id_idx").on(table.id),
	],
);
