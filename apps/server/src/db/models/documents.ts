import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./models/authModels";

export const documents = sqliteTable(
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
		createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("documents_user_id_idx").on(table.userId)],
);
