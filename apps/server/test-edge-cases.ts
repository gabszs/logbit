import { BunFetchInstrumentation } from "@loglog/bun-instrumentation-fetch";
import { BunPgInstrumentation } from "@loglog/bun-instrumentation-pg";
import { BunRedisInstrumentation } from "@loglog/bun-instrumentation-redis";
import { httpInstrumentationMiddleware } from "@hono/otel";
import { NodeSDK, tracing } from "@opentelemetry/sdk-node";
import { Hono } from "hono";
import { proxy } from "hono/proxy";
import { RedisClient, SQL } from "bun";

const memoryExporter = new tracing.InMemorySpanExporter();
const spanProcessor = new tracing.SimpleSpanProcessor(memoryExporter);

const sdk = new NodeSDK({
	serviceName: "edge-case-lab",
	spanProcessors: [spanProcessor],
	instrumentations: [
		new BunPgInstrumentation(),
		new BunRedisInstrumentation(),
		new BunFetchInstrumentation(),
	],
});

sdk.start();

console.log("=================================================");
console.log("🧪 RUNNING COMPREHENSIVE EDGE-CASE TEST SUITE");
console.log("=================================================\n");

const pgUrl = process.env.DATABASE_URL || "postgresql://app_user:app_password@localhost:5432/app_db";
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const upstreamUrl = process.env.UPSTREAM_URL || "http://localhost:5055";

const sql = new Bun.SQL({ url: pgUrl });
const redis = new Bun.RedisClient(redisUrl);

const results: { suite: string; test: string; passed: boolean; details: any }[] = [];

function assert(suite: string, test: string, condition: boolean, details: any) {
	results.push({ suite, test, passed: condition, details });
	const icon = condition ? "✅" : "❌";
	console.log(`  ${icon} [${suite}] ${test}`);
	if (!condition) {
		console.error("     FAIL DETAILS:", details);
	}
}

// -------------------------------------------------------------
// SECTION 1: POSTGRES EDGE CASES
// -------------------------------------------------------------
console.log("\n[1] Testing PostgreSQL Edge Cases...");

// Test 1.1: Syntax error
try {
	await sql`SELECT * FROM non_existent_table_xyz_12345`;
} catch (e: any) {
	// expected
}

// Test 1.2: Transaction rollback
try {
	await sql.transaction(async (tx: any) => {
		await tx`SELECT 1`;
		throw new Error("Forced transaction failure");
	});
} catch (e: any) {
	// expected
}

// Test 1.3: Tagged template with dynamic parameters and .values()
const paramVal = "safe_param_string";
const valuesRes = await sql`SELECT ${paramVal} as val, 42 as num`.values();

// Test 1.4: Dynamic value / object helper call
const helperRes = sql({ a: 1 });
const queryRes = await sql`SELECT 100 as scoped_val`;

await spanProcessor.forceFlush();
const pgSpans = memoryExporter.getFinishedSpans();

const syntaxErrorSpan = pgSpans.find((s) => s.attributes["db.query.text"]?.toString().includes("non_existent_table"));
assert(
	"Postgres",
	"Syntax Error captures SpanStatusCode.ERROR and error.type",
	syntaxErrorSpan?.status.code === 2 && typeof syntaxErrorSpan.attributes["error.type"] === "string",
	{ status: syntaxErrorSpan?.status, errorType: syntaxErrorSpan?.attributes["error.type"] },
);

assert(
	"Postgres",
	"Captures Semantic Conventions: db.system.name, server.address, server.port, db.namespace",
	syntaxErrorSpan?.attributes["db.system.name"] === "postgresql" &&
		syntaxErrorSpan?.attributes["server.address"] === "localhost" &&
		syntaxErrorSpan?.attributes["server.port"] === 5432 &&
		syntaxErrorSpan?.attributes["db.namespace"] === "app_db",
	{ attrs: syntaxErrorSpan?.attributes },
);

const txSpan = pgSpans.find((s) => s.name.includes("transaction"));
assert(
	"Postgres",
	"Transaction Rollback captures Error status and error.type",
	txSpan?.status.code === 2 && txSpan.attributes["error.type"] === "Error",
	{ status: txSpan?.status, errorType: txSpan?.attributes["error.type"] },
);

assert(
	"Postgres",
	".values() chaining executes correctly",
	valuesRes[0][0] === "safe_param_string" && valuesRes[0][1] === 42,
	{ valuesRes },
);

assert(
	"Postgres",
	"Dynamic sql({ a: 1 }) helper returns fragment without corrupting instance",
	queryRes[0]?.scoped_val === 100 && typeof helperRes === "object",
	{ queryRes, helperRes },
);

// -------------------------------------------------------------
// SECTION 2: REDIS EDGE CASES
// -------------------------------------------------------------
console.log("\n[2] Testing Redis Edge Cases...");
memoryExporter.reset();

// Test 2.1: WRONGTYPE error
await redis.set("edge:test:str", "just_a_string");
try {
	await redis.lpush("edge:test:str", "item");
} catch (e) {
	// expected
}

// Test 2.2: Unknown command / ERR status code
try {
	await redis.send("UNKNOWN_COMMAND_XYZ", []);
} catch (e) {
	// expected
}

// Test 2.3: EVAL Lua error
try {
	await redis.send("EVAL", ["invalid lua code syntax $$$", "0"]);
} catch (e) {
	// expected
}

// Test 2.4: Binary Buffer
await redis.set("edge:test:buf", Buffer.from("hello_binary"));
const bufRes = await redis.get("edge:test:buf");

await spanProcessor.forceFlush();
const redisSpans = memoryExporter.getFinishedSpans();

const wrongTypeSpan = redisSpans.find((s) => s.name === "LPUSH");
assert(
	"Redis",
	"WRONGTYPE error captures db.response.status_code and error.type",
	wrongTypeSpan?.attributes["db.response.status_code"] === "WRONGTYPE" &&
		wrongTypeSpan?.attributes["error.type"] === "RedisError" &&
		wrongTypeSpan?.status.code === 2,
	{ attrs: wrongTypeSpan?.attributes, status: wrongTypeSpan?.status },
);

const errSpan = redisSpans.find((s) => s.name === "UNKNOWN_COMMAND_XYZ" || s.name === "SEND");
assert(
	"Redis",
	"ERR error captures db.response.status_code = ERR",
	errSpan?.attributes["db.response.status_code"] === "ERR" && errSpan?.status.code === 2,
	{ attrs: errSpan?.attributes },
);

assert(
	"Redis",
	"Redis SemConv: db.system.name=redis, db.operation.name is UPPERCASE, server.address populated",
	wrongTypeSpan?.attributes["db.system.name"] === "redis" &&
		wrongTypeSpan?.attributes["db.operation.name"] === "LPUSH" &&
		wrongTypeSpan?.attributes["server.address"] === "localhost" &&
		wrongTypeSpan?.attributes["server.port"] === 6379,
	{ attrs: wrongTypeSpan?.attributes },
);

assert(
	"Redis",
	"Binary Buffer set/get succeeds without error",
	bufRes === "hello_binary",
	{ bufRes },
);

// -------------------------------------------------------------
// SECTION 3: HTTP & FETCH & PROXY EDGE CASES
// -------------------------------------------------------------
console.log("\n[3] Testing HTTP / Fetch / hono.proxy() Edge Cases...");
memoryExporter.reset();

// Test 3.1: Connection Refused
try {
	await fetch("http://localhost:59999/unreachable");
} catch (e) {
	// expected
}

// Test 3.2: URL with sensitive credentials
await fetch("http://secret_user:super_secret_password@localhost:5055/auth-endpoint");

// Test 3.3: 404 Not Found response
const notFoundRes = await fetch(`${upstreamUrl}/non-existent-path-404`);

// Test 3.4: Hono route with hono.proxy() and child nested hierarchy
const app = new Hono();
app.use(
	"*",
	httpInstrumentationMiddleware({
		serviceName: "edge-case-service",
		serviceVersion: "1.0.0",
	}),
);

app.get("/proxy-test", async (c) => {
	// internal fetch
	await fetch(`${upstreamUrl}/internal-sub-call`);
	// hono proxy
	return await proxy(`${upstreamUrl}/proxied-sub-call`);
});

const honoRes = await app.request("http://localhost:5051/proxy-test");
const honoBody = await honoRes.json();

await spanProcessor.forceFlush();
const httpSpans = memoryExporter.getFinishedSpans();

const refusedSpan = httpSpans.find((s) => s.attributes["url.full"]?.toString().includes("59999"));
assert(
	"HTTP",
	"Connection refused records SpanStatusCode.ERROR and error.type",
	refusedSpan?.status.code === 2 && typeof refusedSpan.attributes["error.type"] === "string",
	{ status: refusedSpan?.status, errorType: refusedSpan?.attributes["error.type"] },
);

const credsSpan = httpSpans.find((s) => s.attributes["url.full"]?.toString().includes("auth-endpoint"));
const fullUrl = credsSpan?.attributes["url.full"]?.toString() || "";
assert(
	"HTTP",
	"Password in url.full is REDACTED (does not leak plaintext password)",
	fullUrl.includes("REDACTED") && !fullUrl.includes("super_secret_password"),
	{ fullUrl },
);

const span404 = httpSpans.find((s) => s.attributes["url.full"]?.toString().includes("non-existent-path-404"));
assert(
	"HTTP",
	"Status 404 sets SpanStatusCode.ERROR and error.type = '404'",
	span404?.status.code === 2 && span404.attributes["error.type"] === "404",
	{ status: span404?.status, errorType: span404?.attributes["error.type"], code: span404?.attributes["http.response.status_code"] },
);

const rootSpan = httpSpans.find((s) => s.name === "GET /proxy-test");
const proxySpan = httpSpans.find((s) => s.attributes["url.full"]?.toString().includes("proxied-sub-call"));
const internalSpan = httpSpans.find((s) => s.attributes["url.full"]?.toString().includes("internal-sub-call"));

assert(
	"HTTP",
	"hono.proxy() is a child span nested under Hono root span",
	proxySpan?.parentSpanContext?.spanId === rootSpan?.spanContext().spanId,
	{ rootSpanId: rootSpan?.spanContext().spanId, proxyParentId: proxySpan?.parentSpanContext?.spanId },
);

assert(
	"HTTP",
	"Internal fetch is a child span nested under Hono root span",
	internalSpan?.parentSpanContext?.spanId === rootSpan?.spanContext().spanId,
	{ rootSpanId: rootSpan?.spanContext().spanId, internalParentId: internalSpan?.parentSpanContext?.spanId },
);

assert(
	"HTTP",
	"Downstream upstream-service received valid W3C traceparent matching proxy span",
	typeof honoBody.traceparent === "string" &&
		honoBody.traceparent.includes(proxySpan?.spanContext().traceId || "") &&
		honoBody.traceparent.includes(proxySpan?.spanContext().spanId || ""),
	{ receivedTraceparent: honoBody.traceparent, expectedTraceId: proxySpan?.spanContext().traceId, expectedSpanId: proxySpan?.spanContext().spanId },
);

// Summary
const totalTests = results.length;
const passedTests = results.filter((r) => r.passed).length;
console.log("\n=================================================");
console.log(`📋 EDGE-CASE TEST SUITE SUMMARY: ${passedTests}/${totalTests} PASSED`);
console.log("=================================================");

await sql.close();
redis.close();
await sdk.shutdown();

if (passedTests !== totalTests) {
	process.exit(1);
}
