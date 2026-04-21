import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations, users } from "./authModels";

export const userSettings = pgTable(
	"user_settings",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => Bun.randomUUIDv7()),
		theme: text("theme").notNull().default("system"),
		sourceId: uuid("source_id"),
		integrationId: uuid("integration_id"),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "set null",
		}),
		userId: uuid("user_id")
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("user_settings_userId_idx").on(table.userId)],
);
