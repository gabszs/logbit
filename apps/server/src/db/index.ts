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

const shutdown = async () => {
	await pgClient.close(); // drena conexões ativas e fecha o pool
	process.exit(0);
};

process.on("SIGTERM", shutdown); // kill do pod (Kubernetes, Docker)
process.on("SIGINT", shutdown); // Ctrl+C
process.on("beforeExit", shutdown);
