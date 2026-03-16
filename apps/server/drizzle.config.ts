import { settings } from "node:cluster";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/db/models/index.ts",
	out: "./src/db/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: settings.DATABASE_URL!,
	},
});
