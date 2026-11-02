import { BunFetchInstrumentation } from "@loglog/bun-instrumentation-fetch";
import { BunPgInstrumentation } from "@loglog/bun-instrumentation-pg";
import { BunRedisInstrumentation } from "@loglog/bun-instrumentation-redis";
import { httpInstrumentationMiddleware } from "@hono/otel";
import { NodeSDK, tracing } from "@opentelemetry/sdk-node";
import { Hono } from "hono";
import { proxy } from "hono/proxy";
import { RedisClient, SQL } from "bun";

// 1. Setup in-memory tracer to inspect every emitted span
const memoryExporter = new tracing.InMemorySpanExporter();
const spanProcessor = new tracing.SimpleSpanProcessor(memoryExporter);

const sdk = new NodeSDK({
	serviceName: "loglog-lab-service",
	spanProcessors: [spanProcessor],
	instrumentations: [
		new BunPgInstrumentation(),
		new BunRedisInstrumentation(),
		new BunFetchInstrumentation(),
	],
});

sdk.start();

console.log("=================================================");
console.log("🚀 OPENTELEMETRY LAB STARTED (BUN v" + Bun.version + ")");
console.log("=================================================\n");

// 2. Connect to Docker PostgreSQL and Redis
const pgUrl = process.env.DATABASE_URL || "postgresql://app_user:app_password@localhost:5432/app_db";
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const upstreamUrl = process.env.UPSTREAM_URL || "http://localhost:5055";

console.log(`🔌 Connecting to Postgres at ${pgUrl}...`);
const sql = new Bun.SQL({ url: pgUrl });

console.log(`🔌 Connecting to Redis at ${redisUrl}...`);
const redis = new RedisClient(redisUrl);

// 3. Create Hono App with @hono/otel middleware
const app = new Hono();
app.use(
	"*",
	httpInstrumentationMiddleware({
		serviceName: "loglog-lab-service",
		serviceVersion: "1.0.0",
	}),
);

app.get("/lab/full-flow", async (c) => {
	console.log("\n[Hono Handler] /lab/full-flow processing started...");

	// A. PostgreSQL query via Bun.SQL
	const pgResult = await sql`SELECT NOW() as current_time, 'hello_from_bun_postgres' as msg`;
	console.log("  [1/4] PostgreSQL query executed:", pgResult[0]);

	// B. Redis operations via Bun.RedisClient
	await redis.set("lab:test:key", "value_stored_in_redis_" + Date.now());
	const redisValue = await redis.get("lab:test:key");
	console.log("  [2/4] Redis SET and GET executed:", { redisValue });

	// C. Internal HTTP call via Bun native fetch
	const fetchRes = await fetch(`${upstreamUrl}/internal-api?action=fetch_data`);
	const fetchData = await fetchRes.json();
	console.log("  [3/4] Internal native fetch executed -> Upstream received traceparent:", fetchData.traceparent);

	// D. Hono proxy call via hono/proxy
	const proxyRes = await proxy(`${upstreamUrl}/proxy-api?action=proxied_call`);
	const proxyData = await proxyRes.json();
	console.log("  [4/4] hono/proxy() executed -> Upstream received traceparent:", proxyData.traceparent);

	return c.json({
		status: "success",
		pgTime: pgResult[0].current_time,
		redisValue,
		fetchTraceparent: fetchData.traceparent,
		proxyTraceparent: proxyData.traceparent,
	});
});

// 4. Execute test request
console.log("\n📥 Sending GET /lab/full-flow to Hono...");
const res = await app.request("http://localhost:5051/lab/full-flow");
const body = await res.json();
console.log("\n📤 Hono Response status:", res.status);
console.log("Response body:", JSON.stringify(body, null, 2));

// 5. Flush and inspect all generated spans
await spanProcessor.forceFlush();
const spans = memoryExporter.getFinishedSpans();

console.log("\n=================================================");
console.log(`📊 TOTAL SPANS CAPTURED: ${spans.length}`);
console.log("=================================================\n");

// Group spans by traceId
const traces = new Map<string, typeof spans>();
for (const s of spans) {
	const tid = s.spanContext().traceId;
	if (!traces.has(tid)) traces.set(tid, []);
	traces.get(tid)!.push(s);
}

for (const [traceId, traceSpans] of traces.entries()) {
	console.log(`Trace ID: ${traceId}`);
	// Sort by startTime
	traceSpans.sort((a, b) => a.startTime[0] - b.startTime[0] || a.startTime[1] - b.startTime[1]);

	for (const s of traceSpans) {
		const kindMap: Record<number, string> = {
			0: "INTERNAL",
			1: "SERVER",
			2: "CLIENT",
			3: "PRODUCER",
			4: "CONSUMER",
		};
		const kind = kindMap[s.kind] || `KIND_${s.kind}`;
		const isRoot = !s.parentSpanContext?.spanId;
		const prefix = isRoot ? "├── [ROOT] " : "│   ├── [CHILD] ";

		console.log(`${prefix}Span "${s.name}"`);
		console.log(`│   │   Kind:      ${kind}`);
		console.log(`│   │   Span ID:   ${s.spanContext().spanId}`);
		console.log(`│   │   Parent ID: ${s.parentSpanContext?.spanId || "(none - root)"}`);
		console.log(`│   │   Status:    ${s.status.code === 1 ? "OK" : s.status.code === 2 ? "ERROR" : "UNSET"}`);

		// Display key attributes
		const attrs = s.attributes;
		if (attrs["http.request.method"] || attrs["http.route"]) {
			console.log(`│   │   HTTP:      ${attrs["http.request.method"] || ""} ${attrs["http.route"] || attrs["url.full"] || ""}`);
		}
		if (attrs["db.system.name"]) {
			console.log(`│   │   DB System: ${attrs["db.system.name"]}`);
			if (attrs["db.query.text"]) console.log(`│   │   DB Query:  ${attrs["db.query.text"]}`);
			if (attrs["db.operation.name"]) console.log(`│   │   DB Op:     ${attrs["db.operation.name"]}`);
		}
		console.log(`│   │`);
	}
}

// Clean up
await sql.close();
redis.close();
await sdk.shutdown();
console.log("\n✅ LAB COMPLETED SUCCESSFULLY!");
