import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./authModels";

export const connections = pgTable(
	"connections",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => Bun.randomUUIDv7()),
		name: text("name").notNull(),
		host: text("host").notNull(),
		username: text("username").notNull(),
		password: text("password").notNull(),
		database: text("database"),

		userId: uuid("user_id")
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("connections_userId_idx").on(table.userId),
		index("connections_id_idx").on(table.id),
	],
);
