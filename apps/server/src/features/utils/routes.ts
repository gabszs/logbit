import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { logger } from "@/lib/telemetry";
import { status } from "../../lib/constants";
import type { AppContext } from "../../types";
import { healthSchema } from "./schemas";

const utilityRouter = new OpenAPIHono<AppContext>();
const UTILITY_TAGS = ["Utilities"];

utilityRouter.openapi(
	createRoute({
		tags: UTILITY_TAGS,
		summary: "Health check endpoint",
		description:
			"Returns the health status of the service along with the current timestamp",
		method: "get",
		path: "/health",
		responses: {
			[status.OK.code]: status.OK.response(healthSchema),
			[status.TOO_MANY_REQUESTS.code]: status.TOO_MANY_REQUESTS.response(),
			[status.NO_CONTENT.code]: status.NO_CONTENT.response(),
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

export default utilityRouter;
