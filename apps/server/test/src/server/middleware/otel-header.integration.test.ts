import "../../setup/containers";
import { describe, expect, it } from "bun:test";
import { trace } from "@opentelemetry/api";
import { overrideSettings, resetSettings, type Settings } from "@/env";
import { createTestRuntime, disposeTestRuntime } from "../../setup/runtime";

const settingsOverrides: Partial<Settings> = {
	OTEL_TRACE_HEADER_NAME: "x-test-trace-id",
	RATE_LIMIT_ENABLED: false,
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

function withMockedActiveSpan<T>(
	span: ReturnType<typeof trace.wrapSpanContext>,
	run: () => Promise<T>,
) {
	const traceApi = trace as unknown as {
		getActiveSpan: () => ReturnType<typeof trace.wrapSpanContext> | undefined;
	};
	const original = traceApi.getActiveSpan;

	traceApi.getActiveSpan = () => span;

	return run().finally(() => {
		traceApi.getActiveSpan = original;
	});
}

describe("middleware/injectOtelTraceHeader", () => {
	it("injeta o header de trace quando existe span ativo", async () => {
		const runtime = await createMiddlewareRuntime();
		try {
			const span = trace.wrapSpanContext({
				traceId: "0123456789abcdef0123456789abcdef",
				spanId: "0123456789abcdef",
				traceFlags: 1,
			});

			await withMockedActiveSpan(span, async () => {
				const res = await runtime.app.request("/health");

				expect(res.status).toBe(200);
				expect(res.headers.get("x-test-trace-id")).toBe(
					"0123456789abcdef0123456789abcdef",
				);
			});
		} finally {
			await disposeTestRuntime(runtime);
			resetSettings();
		}
	});

	it("nao injeta o header quando nao existe span ativo", async () => {
		const runtime = await createMiddlewareRuntime();
		try {
			const res = await runtime.app.request("/health");

			expect(res.status).toBe(200);
			expect(res.headers.get("x-test-trace-id")).toBeNull();
		} finally {
			await disposeTestRuntime(runtime);
			resetSettings();
		}
	});
});
