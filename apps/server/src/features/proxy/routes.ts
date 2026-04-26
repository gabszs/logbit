import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { proxy } from "hono/proxy";
import z from "zod";
import { db } from "@/db";
import { ConnectionRepository } from "@/features/connections/repository";
import { httpErrors } from "@/lib/errors";
import type { AuthAppContext } from "@/types";
import {
	applyClickhouseConnectionHeaders,
	BLOCKED_REQUEST_HEADERS,
	BLOCKED_RESPONSE_HEADERS,
	buildForwardHeaders,
} from "./headers";
import { ClickhouseProxyService } from "./service";

type ProxyContext = AuthAppContext & {
	Variables: AuthAppContext["Variables"] & {
		service: ClickhouseProxyService;
		activeOrganizationId: string;
	};
};

const clickhouseProxyRouter = new OpenAPIHono<ProxyContext>();

async function forwardClickhouseRequest(
	targetUrl: string,
	options: {
		method: string;
		headers: Headers;
		body?: ReadableStream<Uint8Array> | null;
	},
): Promise<Response> {
	let upstream: Response;
	try {
		upstream = await proxy(targetUrl, {
			method: options.method,
			headers: options.headers,
			body: options.body,
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

async function handleProxy(c: Context<ProxyContext>): Promise<Response> {
	const connectionId = c.req.param("connectionId");
	if (!connectionId || !z.uuidv7().safeParse(connectionId).success) {
		throw httpErrors.badRequest({ detail: "Invalid connection ID" });
	}

	const wildcard = c.req.param("*") ?? "";

	const config = await c
		.get("service")
		.resolveClickhouseConfig(connectionId, c.get("activeOrganizationId"));

	const incomingUrl = new URL(c.req.raw.url);
	const targetUrl = new URL(
		(wildcard ? `/${wildcard}` : "/") + incomingUrl.search,
		config.host,
	);
	if (config.database == null) {
		targetUrl.searchParams.delete("database");
	} else {
		targetUrl.searchParams.set("database", config.database);
	}

	const forwardHeaders = buildForwardHeaders(
		c.req.raw.headers,
		BLOCKED_REQUEST_HEADERS,
	);
	applyClickhouseConnectionHeaders(forwardHeaders, config);

	return await forwardClickhouseRequest(targetUrl.toString(), {
		method: c.req.raw.method,
		headers: forwardHeaders,
		body: ["GET", "HEAD"].includes(c.req.raw.method)
			? undefined
			: c.req.raw.body,
	});
}

clickhouseProxyRouter.all("/proxy/connections/:connectionId", handleProxy);
clickhouseProxyRouter.all("/proxy/connections/:connectionId/*", handleProxy);

export default clickhouseProxyRouter;
