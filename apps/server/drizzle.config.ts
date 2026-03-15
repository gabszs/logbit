import { defineConfig } from "drizzle-kit";
import { settings } from "node:cluster";

export default defineConfig({
	schema: "./src/db/models/index.ts",
	out: "./src/db/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: settings.DATABASE_URL!,
	},
});
