import { ClickhouseDialect } from "@founderpath/kysely-clickhouse";
import { SQL } from "bun";
import "dotenv/config";
import { drizzle } from "drizzle-orm/bun-sql";
import { Kysely } from "kysely";
import { type Settings, settings } from "@/env";
import type { chDB } from "./clickhouse/types";
import { models } from "./models";

// if (settings.NODE_ENV === "test") {
// 	console.log("[db] DATABASE_URL:", settings.DATABASE_URL);
// }

export const createDbClients = (runtimeSettings: Settings) => {
	const chDb = new Kysely<chDB>({
		dialect: new ClickhouseDialect({
			options: {
				url: "http://192.168.1.3:8125",
				username: "default",
				password: "clickhouse",
				database: "default",
			},
		}),
	});

	const pgClient = new SQL({
		url: runtimeSettings.DATABASE_URL,
		max: 10,
		idleTimeout: 30,
		maxLifetime: 300,
		connectionTimeout: 10,
	});

	const db = drizzle(pgClient, {
		schema: models,
		casing: "snake_case",
	});

	return {
		chDb,
		pgClient,
		db,
	};
};

const defaultDbClients = createDbClients(settings);

export const chDb = defaultDbClients.chDb;
export const pgClient = defaultDbClients.pgClient;
export const db = defaultDbClients.db;

export type dbType = typeof db;
