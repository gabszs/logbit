import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { logger } from "@/lib/telemetry";
import { db } from "../../db";
import { models } from "../../db/models";
import { status } from "../../lib/constants";
import type { AppContext } from "../../types";
import { healthSchema, setupSchema } from "./schemas";

const utilityRouter = new OpenAPIHono<AppContext>();

utilityRouter.openapi(
	createRoute({
		tags: ["Utilities"],
		summary: "Health check endpoint",
		description:
			"Returns the health status of the service along with the current timestamp",
		method: "post",
		path: "/health",
		responses: {
			[status.OK.code]: status.OK.response(healthSchema),
			[status.TOO_MANY_REQUESTS.code]: status.TOO_MANY_REQUESTS.response(),
			[status.INTERNAL_SERVER_ERROR.code]:
				status.INTERNAL_SERVER_ERROR.response(),
		},
	}),
	async (c) => {
		logger.info("Health check endpoint called");
		return c.json({
			status: "ok",
			timestamp: new Date().toISOString(),
		});
	},
);

utilityRouter.openapi(
	createRoute({
		tags: ["Utilities"],
		summary: "Setup status endpoint",
		description: "Returns whether any users exist in the system",
		method: "get",
		path: "/setup",
		responses: {
			[status.OK.code]: status.OK.response(setupSchema),
			[status.TOO_MANY_REQUESTS.code]: status.TOO_MANY_REQUESTS.response(),
			[status.INTERNAL_SERVER_ERROR.code]:
				status.INTERNAL_SERVER_ERROR.response(),
		},
	}),
	async (c) => {
		const result = await db
			.select({ id: models.users.id })
			.from(models.users)
			.limit(1);

		return c.json({ hasUsers: result.length > 0 });
	},
);

export default utilityRouter;
