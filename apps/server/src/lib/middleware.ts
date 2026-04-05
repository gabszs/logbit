import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppContext, AuthAppContext } from "../types";
import { auth } from "./auth";
import { error } from "./errors";

// DEVO USAR SINGLETON NO AUTH OU CRIOU TODA VEZ????
export const authenticateSession = createMiddleware<AuthAppContext>(
	async (c, next) => {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });

		if (!session) {
			throw new HTTPException(401, { message: "Unauthorized" });
		}
		c.set("user", session.user);
		c.set("session", session.session);

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
			throw error.unsupportedMediaType({
				title: "Unsupported Media Type",
				detail: `Content-Type ${contentType ?? "none"} is not supported. Supported types are: ${allowedContentTypes.join(" and ")}`,
			});
		}
		await next();
	});
