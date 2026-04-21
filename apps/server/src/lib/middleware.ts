import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { settings } from "@/env";
import type { AppContext, AuthAppContext } from "../types";
import { type AuthSessionData, auth } from "./auth";
import { httpErrors } from "./errors";

// DEVO USAR SINGLETON NO AUTH OU CRIOU TODA VEZ????
export const authenticateSession = createMiddleware<AuthAppContext>(
	async (c, next) => {
		const authBasePath = `${settings.SERVE_STATIC ? "/api" : ""}${settings.AUTH_BASE_PATH}`;
		if (
			c.req.path === authBasePath ||
			c.req.path.startsWith(`${authBasePath}/`)
		) {
			await next();
			return;
		}
		const session = await auth.api.getSession({ headers: c.req.raw.headers });

		if (!session) {
			throw new HTTPException(401, { message: "Unauthorized" });
		}
		c.set("user", session.user);
		c.set("session", session.session as AuthSessionData);

		await next();
	},
);

export const requireContentType = (allowedContentTypes: string[]) =>
	createMiddleware<AppContext>(async (c, next) => {
		const contentType = c.req.header("content-type");
		if (
			!contentType ||
			!allowedContentTypes.some((type) => contentType.includes(type))
		) {
			throw httpErrors.unsupportedMediaType({
				title: "Unsupported Media Type",
				detail: `Content-Type ${contentType ?? "none"} is not supported. Supported types are: ${allowedContentTypes.join(" and ")}`,
			});
		}
		await next();
	});
