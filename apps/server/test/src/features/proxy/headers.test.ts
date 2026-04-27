import { describe, expect, it } from "bun:test";
import {
	applyClickhouseConnectionHeaders,
	BLOCKED_REQUEST_HEADERS,
	buildForwardHeaders,
} from "@/features/proxy/headers";

describe("ClickHouse proxy headers", () => {
	it("strips client-controlled headers and injects saved connection config", () => {
		const inputHeaders = new Headers({
			authorization: "Bearer token",
			cookie: "session=abc",
			host: "malicious.example.com",
			"x-clickhouse-user": "spoofed-user",
			"x-clickhouse-key": "spoofed-key",
			"x-clickhouse-database": "spoofed-db",
			"content-type": "application/json",
			"x-trace-id": "trace-123",
		});

		const forwardHeaders = buildForwardHeaders(
			inputHeaders,
			BLOCKED_REQUEST_HEADERS,
		);
		applyClickhouseConnectionHeaders(forwardHeaders, {
			username: "server-user",
			password: "server-secret",
			database: "analytics",
		});

		expect(forwardHeaders.get("authorization")).toBeNull();
		expect(forwardHeaders.get("cookie")).toBeNull();
		expect(forwardHeaders.get("host")).toBeNull();
		expect(forwardHeaders.get("x-clickhouse-user")).toBe("server-user");
		expect(forwardHeaders.get("x-clickhouse-key")).toBe("server-secret");
		expect(forwardHeaders.get("x-clickhouse-database")).toBe("analytics");
		expect(forwardHeaders.get("content-type")).toBe("application/json");
		expect(forwardHeaders.get("x-trace-id")).toBe("trace-123");
	});

	it("preserves an explicitly empty password when the saved config has one", () => {
		const forwardHeaders = new Headers();
		applyClickhouseConnectionHeaders(forwardHeaders, {
			username: "server-user",
			password: "",
			database: null,
		});

		expect(forwardHeaders.get("x-clickhouse-user")).toBe("server-user");
		expect(forwardHeaders.get("x-clickhouse-key")).toBe("");
		expect(forwardHeaders.get("x-clickhouse-database")).toBeNull();
	});
});
