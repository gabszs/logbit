import {
	context as otelContext,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import type { Next } from "hono";
import { createMiddleware } from "hono/factory";
import { UAParser } from "ua-parser-js";
import type { ApiKey } from "../features/apiKeys/schemas";
import type { AppContext, HonoEnv } from "../types";
import { httpErrors } from "./errors";
import { buildOtelQueryAttributeMap } from "./telemetry";

export const authMiddleware = (
	options: { adminOnly?: boolean; allowApiKey?: boolean } = {},
) =>
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
		if (options.adminOnly && session.user.role !== "admin")
			throw httpErrors.forbidden();

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
