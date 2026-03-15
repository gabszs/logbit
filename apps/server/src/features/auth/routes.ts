import { OpenAPIHono } from "@hono/zod-openapi";
import { auth } from "@/lib/auth";
import type { AppContext } from "@/types";

const authRouter = new OpenAPIHono<AppContext>({
	strict: false,
});

authRouter.on(["POST", "GET"], "/auth/*", async (c) => {
	return auth.handler(c.req.raw);
});

export default authRouter;
