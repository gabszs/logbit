import {
	boolean,
	index,
	json,
	pgEnum,
	pgTable,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./authModels";

export const contactPointTypeEnum = pgEnum("type", ["email", "webhook"]);
export const contactPointTransportEnum = pgEnum("transport", [
	"smtp",
	"http",
	"resend",
]);

export const contactPoints = pgTable(
	"contact_points",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => Bun.randomUUIDv7()),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		type: contactPointTypeEnum("type").notNull(),
		transport: contactPointTransportEnum("transport").notNull(),
		config: json("config")
			.$type<Record<string, string | number | boolean>>()
			.notNull(),
		isDefault: boolean("is_default").default(false).notNull(),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("contact_points_organization_id_idx").on(table.organizationId),
		index("contact_points_id_idx").on(table.id),
	],
);
