import { afterAll, afterEach, beforeAll } from "bun:test";
import type { TestHelpers } from "better-auth/plugins";
import { overrideSettings, resetSettings, type Settings } from "@/env";
import { truncateAllTables } from "../../setup/db";
import {
	createTestRuntime,
	disposeTestRuntime,
	type TestRuntime,
} from "../../setup/runtime";

type SetupAuthLifecycleOptions = {
	settingsOverrides?: Partial<Settings>;
	disableRedis?: boolean;
};

let runtime: TestRuntime | null = null;
let authClient: TestHelpers | null = null;

export const setupAuthTestLifecycle = (
	options: SetupAuthLifecycleOptions = {},
) => {
	beforeAll(async () => {
		const disableRedis = options.disableRedis ?? true;
		resetSettings();
		overrideSettings({
			NODE_ENV: "test",
			...(disableRedis ? { REDIS_URL: undefined } : {}),
			...options.settingsOverrides,
		});
		runtime = await createTestRuntime();

		const ctx = await runtime.auth.$context;
		authClient = ctx.test;
	});

	afterEach(async () => {
		const currentRuntime = getAuthTestRuntime();
		await truncateAllTables(currentRuntime.db);
	});

	afterAll(async () => {
		if (runtime) {
			await disposeTestRuntime(runtime);
			runtime = null;
		}
		authClient = null;
		resetSettings();
	});
};

export const getAuthTestRuntime = () => {
	if (runtime == null) {
		throw new Error("Auth runtime is not initialized. Did you call setup?");
	}

	return runtime;
};

export const getAuthTestClient = () => {
	if (authClient == null) {
		throw new Error("Auth test client is not initialized. Did you call setup?");
	}

	return authClient;
};
