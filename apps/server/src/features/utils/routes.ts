import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { logger } from "@/lib/telemetry";
import {
	ContentTypes,
	HttpStatusCodes,
	HttpStatusDescriptions,
} from "../../lib/constants";
import type { AppContext } from "../../types";
import { healthSchema } from "./schemas";

const utilityRoutes = new OpenAPIHono<AppContext>();

utilityRoutes.openapi(
	createRoute({
		tags: ["utilities"],
		summary: "Health check endpoint",
		description:
			"Returns the health status of the service along with the current timestamp",
		method: "get",
		path: "/health",
		responses: {
			[HttpStatusCodes.OK]: {
				description: HttpStatusDescriptions.OK,
				content: {
					[ContentTypes.JSON]: {
						schema: healthSchema,
					},
				},
			},
		},
	}),
	async (c: AppContext) => {
		logger.warn("This is a warning message");
		return c.json(
			{
				status: "ok",
				timestamp: new Date().toISOString(),
			},
			HttpStatusCodes.OK,
		);
	},
);

export default utilityRoutes;
