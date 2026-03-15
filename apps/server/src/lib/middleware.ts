import { context as otelContext, SpanStatusCode, trace } from "@opentelemetry/api";
import { type Next } from "hono";
import { createMiddleware } from "hono/factory";
import { UAParser } from "ua-parser-js";
import { type ApiKey } from "../features/apiKeys/schemas";
import { type AppContext, type HonoEnv } from "../types";
import { httpErrors } from "./errors";
import { buildOtelQueryAttributeMap } from "./telemetry";

export const authMiddleware = (options: { adminOnly?: boolean; allowApiKey?: boolean } = {}) =>
	createMiddleware<HonoEnv>(async (c: AppContext, next) => {
		const event = c.get("wideEvent");

		// Tenta autenticação via API Key primeiro
		if (options.allowApiKey) {
			const bearer = c.req.header("Authorization");
			const apiKeyToken = bearer?.toLowerCase().split("bearer ")[1];

			if (apiKeyToken?.startsWith("tk_")) {
				const object = await c.env.R2.get(`api-keys/${apiKeyToken}`);
				if (!object) throw httpErrors.unauthorized();

				const apiKeyData = await object.json<ApiKey>();
				if (!apiKeyData.isActive) throw httpErrors.unauthorized();

				const authenticatedUser = { ...apiKeyData, auth_method: "api-key" };
				c.set("user", authenticatedUser);

				// Telemetria para API Key
				event["user.id"] = apiKeyData.userId;
				event["auth.method"] = "api-key";
				event["api_key.id"] = apiKeyData.id;
				event["api_key.name"] = apiKeyData.name;
				event["api_key.type"] = apiKeyData.type;
				event["api_key.created_at"] = apiKeyData.createdAt;

				return next();
			}
		}

		// Autenticação via sessão
		const auth = c.get("auth");
		const session = await auth.api.getSession({ headers: c.req.raw.headers });

		if (!session) throw httpErrors.unauthorized();
		if (options.adminOnly && session.user.role !== "admin") throw httpErrors.forbidden();

		session.user.auth_method = "session";
		c.set("user", session.user);
		c.set("session", session.session);

		// Telemetria para sessão
		event["user.id"] = session.user.id;
		event["user.role"] = session.user.role;
		event["auth.method"] = "session";
		event["user.banned"] = session.user.banned;
		event["user.created_at"] = session.user.created_at;
		event["user.assumed"] = !!session.session.impersonated_by;
		event["user.assumed_by"] = session.session.impersonated_by;
		event["session.id"] = session.session.id;
		event["session.created_at"] = session.session.createdAt;
		event["session.updated_at"] = session.session.updatedAt;
		event["session.expires_at"] = session.session.expiresAt;

		return next();
	});

interface TraceIdMiddlewareOptions {
	headerName?: string;
}

function buildUserAgentAttributes(userAgent: string | undefined) {
	if (!userAgent) return {};

	const ua = new UAParser(userAgent).getResult();
	return {
		"user_agent.original": userAgent,
		"user_agent.device.model": ua.device.model,
		"user_agent.device.type": ua.device.type,
		"user_agent.device.vendor": ua.device.vendor,
		"user_agent.os": ua.os.name,
		"user_agent.os.version": ua.os.version,
		"user_agent.browser": ua.browser.name,
		"user_agent.browser_version": ua.browser.version,
		"user_agent.browser_major": ua.browser.major,
		"user_agent.browser.type": ua.browser.type,
		"user_agent.cpu.architecture": ua.cpu.architecture,
		"user_agent.engine": ua.engine.name,
		"user_agent.engine.version": ua.engine.version,
	};
}

function buildServiceAttributes(c: AppContext) {
	return {
		"service.environment": c.env.ENVIRONMENT,
		"deployment.environment": c.env.ENVIRONMENT,
		"service.team": "gabrielcarvalho",
		"service.owner": "gabrielcarvalho",
		"service.version": c.env.SERVICE_VERSION,
		"service.discord": "kali9849",
		"service.build.git_hash": c.env.commitHash,
		"service.build.git_branch": c.env.commitBranch,
		"service.build.deployment.user": c.env.deploymentUser,
		// "service.build.deployment.email": c.env.deploymentEmail,
		"service.build.deployment.trigger": c.env.deploymentTrigger,
		"service.build.deployment.id": c.env.VERSION_METADATA.id,
		"service.build.deployment.timestamp": c.env.VERSION_METADATA.timestamp,
	};
}

function buildClientGeoAttributes(cf: Record<string, unknown> | undefined) {
	if (!cf) return {};
	return {
		// Geo location
		"client.geo.country.iso_code": cf.country,
		"client.geo.continent.code": cf.continent,
		"client.geo.region.iso_code": cf.regionCode,
		"client.geo.locality.name": cf.city,
		"client.geo.postal_code": cf.postalCode,
		"client.geo.location.lat": cf.latitude,
		"client.geo.location.lon": cf.longitude,
		// Network/Cloud
		"cloud.availability_zone": cf.colo,
		"http.flavor": cf.httpProtocol,
		"network.tls.protocol.version": cf.tlsVersion,
		"network.tls.cipher": cf.tlsCipher,
	};
}

function buildBrowserAttributes(c: AppContext) {
	const secChUa = c.req.header("sec-ch-ua");
	const secChUaMobile = c.req.header("sec-ch-ua-mobile");
	const secChUaPlatform = c.req.header("sec-ch-ua-platform");

	return {
		"browser.brands": secChUa,
		"browser.mobile": secChUaMobile === "?1",
		"browser.platform": secChUaPlatform?.replace(/"/g, ""),
	};
}

async function extractErrorAttributes(response: Response) {
	const clonedResponse = response.clone();
	const body = (await clonedResponse.json()) as { error?: string; message?: string; code?: string };
	return {
		"error.status": body.status,
		"error.message": body.message,
		"error.code": body.code,
		outcome: "error",
	};
}

export const otelConfig = (options: TraceIdMiddlewareOptions = {}) =>
	createMiddleware(async (c: AppContext, next: Next) => {
		const { headerName = "otel-trace-id" } = options;
		const startTime = Date.now();
		const span = trace.getSpan(otelContext.active());
		const traceId = span?.spanContext().traceId;

		const client_address = c.req.header("cf-connecting-ip");
		const userAgent = c.req.header("user-agent");

		// Extrai o body se existir
		let requestBody: unknown;
		try {
			requestBody = await c.req.json();
		} catch {
			// Não há body ou não é JSON
		}

		const event: Record<string, unknown> = {
			...buildServiceAttributes(c),
			...buildClientGeoAttributes(c.req.raw.cf),
			...buildUserAgentAttributes(userAgent),
			...buildBrowserAttributes(c),
			"http.request.id": c.req.header("cf-ray"),
			"deployment.id": c.env.VERSION_METADATA.id,
			timestamp: new Date(startTime).toISOString(),
			"client.address": client_address,
			...(requestBody !== undefined && { "http.request.body": requestBody }),
		};

		c.set("wideEvent", event);

		if (span) {
			span.setAttribute("client.address", client_address);
			span.setAttributes(buildOtelQueryAttributeMap(c.req.query()));
		}

		await next();

		const status_code = c.res.status;
		const isError = status_code >= 400;
		const isRateLimit = status_code === 429;
		const isJsonError =
			isError && !isRateLimit && c.res.headers.get("content-type")?.includes("application/json");

		event["http.response.status_code"] = status_code;
		event["duration_ms"] = Date.now() - startTime;
		event["ratelimit.triggered"] = isRateLimit;

		if (isJsonError) {
			// Object.assign(event, await extractErrorAttributes(c.res));
			event["outcome"] = "error";
		} else {
			event["outcome"] = "success";
		}

		// if (span && traceId) {
			// span.addEvent("wideEvent", event);
			// span.setAttributes(event);
			// if (isError) {
			// 	span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${status_code}` });
			// } else {
			// 	span.setStatus({ code: SpanStatusCode.OK });
			// }
		// }
		span.setAttributes(event);
		c.res.headers.set(headerName, traceId);
	});
