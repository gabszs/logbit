import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import type { Settings } from "@/env";
import {
	createServerRuntime,
	type ServerRuntime,
	type ServerRuntimeConfig,
} from "@/lib/runtime";

type TestRuntimeOptions = {
	settingsOverrides?: Partial<Settings>;
	runMigrations?: boolean;
};

export type TestRuntime = ServerRuntime & {
	databaseName: string;
};

const baseDatabaseUrl = process.env.DATABASE_URL;

if (!baseDatabaseUrl) {
	throw new Error("DATABASE_URL is required in test runtime setup");
}

const adminSql = new SQL({ url: baseDatabaseUrl });
const adminDb = drizzle(adminSql);

const generateDatabaseName = () => {
	return `test_${Bun.randomUUIDv7().replaceAll("-", "_")}`;
};

const createDatabaseUrl = (databaseName: string) => {
	const url = new URL(baseDatabaseUrl);
	url.pathname = `/${databaseName}`;
	return url.toString();
};

const assertSafeDatabaseName = (databaseName: string) => {
	if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
		throw new Error(`Unsafe database name: ${databaseName}`);
	}
};

const createIsolatedDatabase = async (databaseName: string) => {
	assertSafeDatabaseName(databaseName);
	await adminDb.execute(sql.raw(`CREATE DATABASE "${databaseName}"`));
};

const dropIsolatedDatabase = async (databaseName: string) => {
	assertSafeDatabaseName(databaseName);
	await adminDb.execute(
		sql.raw(`
			SELECT pg_terminate_backend(pid)
			FROM pg_stat_activity
			WHERE datname = '${databaseName}'
			AND pid <> pg_backend_pid()
		`),
	);
	await adminDb.execute(sql.raw(`DROP DATABASE IF EXISTS "${databaseName}"`));
};

export const createTestRuntime = async (
	options: TestRuntimeOptions = {},
): Promise<TestRuntime> => {
	const databaseName = generateDatabaseName();
	await createIsolatedDatabase(databaseName);

	try {
		const runtimeConfig: ServerRuntimeConfig = {
			runMigrations: options.runMigrations ?? true,
			showRoutes: false,
			settingsOverrides: {
				NODE_ENV: "test",
				DATABASE_URL: createDatabaseUrl(databaseName),
				...options.settingsOverrides,
			},
		};

		const runtime = await createServerRuntime(runtimeConfig);

		return {
			...runtime,
			databaseName,
		};
	} catch (error) {
		await dropIsolatedDatabase(databaseName);
		throw error;
	}
};

export const disposeTestRuntime = async (runtime: TestRuntime) => {
	try {
		await runtime.shutdown({ exitProcess: false });
	} finally {
		await dropIsolatedDatabase(runtime.databaseName);
	}
};
