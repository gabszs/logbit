import path from "node:path";
import { defineWorkersProject, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject(async () => {
	const migrationsPath = path.join(__dirname, "migrations");
	const migrations = await readD1Migrations(migrationsPath);

	return {
		// plugins: [tsconfigPaths()],
		// resolve: {
		//   alias: {

		//   }
		// }
		define: {
			PRODUCTION: "true",
		},
		timeout: 60000,
		test: {
			setupFiles: ["./test/setup.ts"],
			globals: true,
			deps: {
				optimizer: {
					ssr: {
						enabled: true,
						include: [
							"ajv",
							"@opentelemetry/resources",
							"@opentelemetry/api",
							"@microlabs/otel-cf-workers",
							"@hono/otel",
							"mimetext",
						],
					},
				},
			},
			coverage: {
				provider: "istanbul",
				enabled: true,
				include: ["src/**/*.ts"],
				reporter: ["text", "json", "html", "lcov"],
			},
			poolOptions: {
				workers: {
					wrangler: { configPath: "./wrangler.jsonc" },
					singleWorker: true,
					isolatedStorage: true,
					miniflare: {
						compatibilityFlags: ["service_binding_extra_handlers", "nodejs_compat", "rpc"],
						compatibilityDate: "2024-04-01",
						d1Databases: ["D1"],
						bindings: { TEST_MIGRATIONS: migrations },
					},
				},
			},
		},
	};
});
