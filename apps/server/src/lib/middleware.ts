import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "../types";
import { auth } from "./auth";

// DEVO USAR SINGLETON NO AUTH OU CRIOU TODA VEZ????
export const authenticateSession = createMiddleware<AppContext>(
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
