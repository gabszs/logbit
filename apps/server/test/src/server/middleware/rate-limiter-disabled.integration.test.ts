import "../../setup/containers";
import { describe, expect, it } from "bun:test";
import { overrideSettings, resetSettings, type Settings } from "@/env";
import { createTestRuntime, disposeTestRuntime } from "../../setup/runtime";

const settingsOverrides: Partial<Settings> = {
	RATE_LIMIT_ENABLED: false,
	RATE_LIMIT_MAX_REQUESTS: 1,
	REDIS_URL: undefined,
	OTEL_TRACE_HEADER_NAME: "otel-trace-id",
};

async function createMiddlewareRuntime() {
	resetSettings();
	overrideSettings({
		NODE_ENV: "test",
		REDIS_URL: undefined,
		...settingsOverrides,
	});

	return await createTestRuntime();
}

describe("middleware/rateLimiter (flag desabilitada)", () => {
	it("nao bloqueia requisições repetidas para o mesmo cliente", async () => {
		const runtime = await createMiddlewareRuntime();
		try {
			const headers = new Headers({
				"x-client-ip": "203.0.113.10",
			});

			const first = await runtime.app.request("/v1/auth/get-session", {
				headers,
			});
			const second = await runtime.app.request("/v1/auth/get-session", {
				headers,
			});

			expect(first.status).toBe(200);
			expect(second.status).toBe(200);
		} finally {
			await disposeTestRuntime(runtime);
			resetSettings();
		}
	});
});
