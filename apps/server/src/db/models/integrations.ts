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
import { organizations } from "./authModels";
import { supportedIntegrationTypes } from "@/integrations/senderFactory";

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
	],
);
