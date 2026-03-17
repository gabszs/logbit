import { defineConfig } from "drizzle-kit";
import { settings } from "@/env";

if (!settings.DATABASE_URL) {
	throw new Error("DATABASE_URL is required to run Drizzle config");
}

export default defineConfig({
	schema: "./src/db/models/index.ts",
	out: "./src/db/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: settings.DATABASE_URL,
	},
});
