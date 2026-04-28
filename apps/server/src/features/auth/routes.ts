import { OpenAPIHono } from "@hono/zod-openapi";
import { settings } from "@/env";
import { auth } from "@/lib/auth";
import type { AppContextType } from "@/types";

const authRouter = new OpenAPIHono<AppContextType>({
	strict: false,
}).on(["POST", "GET"], "/auth/*", async (c) => {
	if (c.req.path === `${settings.AUTH_BASE_PATH}/open-api/generate-schema`) {
		return c.notFound();
	}
	return auth.handler(c.req.raw);
});

export default authRouter;
