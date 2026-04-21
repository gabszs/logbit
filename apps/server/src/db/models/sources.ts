import { sql } from "drizzle-orm";
import {
	check,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./authModels";
import { integrations } from "./integrations";
import { log } from "node:console";
import { spanIdField, traceIdField } from "@mastra/core/storage";

export const dataSourceTypeEnum = pgEnum("data_source_type", [
	"trace",
	"log",
	"metric",
]);

export const dataSources = pgTable(
	"data_sources",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => Bun.randomUUIDv7()),
		name: varchar("name", { length: 255 }).notNull(),
		type: dataSourceTypeEnum("type").notNull(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		integrationId: uuid("integration_id")
			.notNull()
			.references(() => integrations.id, { onDelete: "cascade" }),

		defaultSelectQuery: text("default_select_query").default(
			"Timestamp, ServiceName as service, SeverityText as level, Body",
		),
        defaultOrderByQuery: text("default_order_by_query").default("Timestamp DESC"),

		severityField: varchar("severity_field", {
			length: 255,
		}).default("SeverityText"),
        resourceAttributesField: varchar("resource_attributes_field", {
			length: 255,
		}).default("ResourceAttributes"),
        logAttributesField: varchar("log_attributes_field", {
            length: 255,
        }).default("LogAttributes"),
        bodyField: varchar("body_field", {
            length: 255,
        }).default("Body"),
        traceIdField: varchar("trace_id_field", {
            length: 255,
        }).default("TraceId"),
        spanIdField: varchar("span_id_field", {
            length: 255,
        }).default("SpanId"),
        luceneImplicitColumnField: text("lucene_implicit_column_query").default("Body"),

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

export const dataSourceCorrelations = pgTable(
	"data_source_correlations",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => Bun.randomUUIDv7()),
		sourceId: uuid("source_id")
			.notNull()
			.references(() => dataSources.id, { onDelete: "cascade" }),
		targetId: uuid("target_id")
			.notNull()
			.references(() => dataSources.id, { onDelete: "cascade" }),
		correlationKey: varchar("correlation_key", { length: 100 }),
		notes: text("notes"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		// sem duplicata direcional (A→B duas vezes)
		unique("uq_directional_correlation").on(table.sourceId, table.targetId),
		// sem auto-correlação
		check(
			"chk_no_self_correlation",
			sql`${table.sourceId} <> ${table.targetId}`,
		),
		index("data_source_correlations_source_id_idx").on(table.sourceId),
		index("data_source_correlations_target_id_idx").on(table.targetId),
	],
);
