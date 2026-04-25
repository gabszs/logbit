import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@/db";
import { ConnectionRepository } from "@/features/connections/repository";
import { httpErrors } from "@/lib/errors";
import type { AuthAppContext } from "@/types";
import { ClickhouseProxyService } from "./service";

// Headers from the client request that must never reach ClickHouse.
// Auth headers are always replaced with the connection's real credentials.
const BLOCKED_REQUEST_HEADERS = new Set([
	"host",
	"x-clickhouse-user",
	"x-clickhouse-key",
	"authorization",
	"cookie",
]);

// Hop-by-hop headers that must not be forwarded in the response.
// www-authenticate is also blocked: if ClickHouse returns 401, forwarding
// this header would trigger the browser's native Basic Auth dialog.
const BLOCKED_RESPONSE_HEADERS = new Set([
	"transfer-encoding",
	"connection",
	"keep-alive",
	"upgrade",
	"proxy-authenticate",
	"proxy-authorization",
	"www-authenticate",
	"te",
	"trailers",
]);

type ProxyContext = AuthAppContext & {
	Variables: AuthAppContext["Variables"] & {
		service: ClickhouseProxyService;
		activeOrganizationId: string;
	};
};

const clickhouseProxyRouter = new OpenAPIHono<ProxyContext>();

clickhouseProxyRouter.use(async (c, next) => {
	const connectionRepository = new ConnectionRepository(db);
	const service = new ClickhouseProxyService(connectionRepository);
	const session = c.get("session");
	const activeOrganizationId = session.activeOrganizationId;

	if (activeOrganizationId == null) {
		throw httpErrors.forbidden({ detail: "No active organization" });
	}

	c.set("service", service);
	c.set("activeOrganizationId", activeOrganizationId);
	await next();
});

async function executeProxy(
	connectionId: string,
	wildcardSegment: string,
	rawRequest: Request,
	service: ClickhouseProxyService,
	activeOrganizationId: string,
): Promise<Response> {
	const config = await service.resolveClickhouseConfig(
		connectionId,
		activeOrganizationId,
	);

	const targetPath = wildcardSegment ? `/${wildcardSegment}` : "/";
	const incomingUrl = new URL(rawRequest.url);
	const targetUrl = new URL(targetPath + incomingUrl.search, config.host);

	const forwardHeaders = new Headers();
	for (const [key, value] of rawRequest.headers.entries()) {
		if (!BLOCKED_REQUEST_HEADERS.has(key.toLowerCase())) {
			forwardHeaders.set(key, value);
		}
	}
	forwardHeaders.set("X-ClickHouse-User", config.username);
	if (config.password) {
		forwardHeaders.set("X-ClickHouse-Key", config.password);
	}

	let upstream: Response;
	try {
		upstream = await fetch(targetUrl.toString(), {
			method: rawRequest.method,
			headers: forwardHeaders,
			body: ["GET", "HEAD"].includes(rawRequest.method)
				? undefined
				: rawRequest.body,
		});
	} catch {
		throw httpErrors.badGateway({
			detail: "Could not reach the ClickHouse host for this connection",
		});
	}

	const responseHeaders = new Headers();
	for (const [key, value] of upstream.headers.entries()) {
		if (!BLOCKED_RESPONSE_HEADERS.has(key.toLowerCase())) {
			responseHeaders.set(key, value);
		}
	}

	return new Response(upstream.body, {
		status: upstream.status,
		headers: responseHeaders,
	});
}

// Root path — ClickHouse HTTP interface default endpoint
clickhouseProxyRouter.all(
	"/proxy/connections/:connectionId",
	(c) =>
		executeProxy(
			c.req.param("connectionId"),
			"",
			c.req.raw,
			c.get("service"),
			c.get("activeOrganizationId"),
		),
);

// All sub-paths — /ping, named routes, etc.
clickhouseProxyRouter.all(
	"/proxy/connections/:connectionId/*",
	(c) =>
		executeProxy(
			c.req.param("connectionId"),
			c.req.param("*") ?? "",
			c.req.raw,
			c.get("service"),
			c.get("activeOrganizationId"),
		),
);

export default clickhouseProxyRouter;
