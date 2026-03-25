import { SQL } from "bun";
import { settings } from "@/env";
import "dotenv/config";
import { drizzle } from "drizzle-orm/bun-sql";
import { models } from "./models";

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
