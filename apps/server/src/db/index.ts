import { ClickhouseDialect } from "@founderpath/kysely-clickhouse";
import { SQL } from "bun";
import "dotenv/config";
import { drizzle } from "drizzle-orm/bun-sql";
import { Kysely } from "kysely";
import { settings } from "@/env";
import type { chDB } from "./clickhouse/types";
import { models } from "./models";

export const chDb = new Kysely<chDB>({
	dialect: new ClickhouseDialect({
		options: {
			url: "http://192.168.1.3:8125",
			username: "default",
			password: "clickhouse",
			database: "default",
		},
	}),
});

export const pgClient = new SQL({
	url: settings.DATABASE_URL,
	max: 10,
	idleTimeout: 30,
	maxLifetime: 300,
	connectionTimeout: 10,
});

export const db = drizzle(pgClient, {
	schema: models,
	casing: "snake_case",
});

export type dbType = ReturnType<typeof drizzle>;
