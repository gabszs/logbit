import type { RedisClient } from "bun";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { dbType } from "@/db";
import type { Settings } from "@/env";
import type { AuthType } from "@/lib/auth";
import type { AppContext } from "@/types";

type TestRuntimeOptions = {
	runMigrations?: boolean;
};

export type TestRuntime = {
	settings: Settings;
	app: OpenAPIHono<AppContext>;
	auth: AuthType;
	db: dbType;
	pgClient: {
		close: () => Promise<void>;
	};
	redis: RedisClient;
	orpcRouter: Record<string, unknown>;
	shutdown: (options?: { exitProcess?: boolean }) => Promise<void>;
	apiPrefix: string;
	databaseName: string;
};

const getDatabaseNameFromUrl = (databaseUrl: string): string => {
	const url = new URL(databaseUrl);
	return url.pathname.replace(/^\//, "") || "";
};

export const createTestRuntime = async (
	_options: TestRuntimeOptions = {},
): Promise<TestRuntime> => {
	const [envModule, indexModule, authModule, dbModule, cacheModule] =
		await Promise.all([
			import("@/env"),
			import("@/index"),
			import("@/lib/auth"),
			import("@/db"),
			import("@/lib/cache"),
		]);

	const runtimeSettings = envModule.settings;
	const databaseName = getDatabaseNameFromUrl(runtimeSettings.DATABASE_URL);

	return {
		settings: runtimeSettings,
		app: indexModule.app,
		auth: authModule.auth,
		db: dbModule.db,
		pgClient: dbModule.pgClient,
		redis: cacheModule.redis,
		orpcRouter: indexModule.OrpcRouter as Record<string, unknown>,
		apiPrefix: runtimeSettings.SERVE_STATIC ? "/api" : "",
		databaseName,
		shutdown: async ({ exitProcess = false } = {}) => {
			if (exitProcess) {
				process.exit(0);
			}
		},
	};
};

export const disposeTestRuntime = async (runtime: TestRuntime) => {
	await runtime.shutdown({ exitProcess: false });
};
