import { index, pgTable, sql, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./authModels";

export const documents = pgTable(
	"documents",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		type: text("type").notNull(),
		description: text("description"),
		metadata: text("metadata").notNull(),
		s3_file_key: text("s3_file_key"),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.$onUpdate(() => sql`now()`)
			.notNull(),
	},
	(table) => [index("documents_user_id_idx").on(table.userId)],
);
