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

export const integrationTypeEnum = pgEnum("type", [
	"discord",
	"telegram",
	"webhook",
	"cloudflare_email",
	"resend",
]);

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
		config: jsonb("config")
			.$type<Record<string, string | number | boolean>>()
			.notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		isDefault: boolean("is_default").default(false).notNull(),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("integrations_organization_id_idx").on(table.organizationId),
		index("integrations_id_idx").on(table.id),
	],
);
