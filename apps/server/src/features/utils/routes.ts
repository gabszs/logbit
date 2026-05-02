import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { db } from "../../db";
import { models } from "../../db/models";
import { ContentTypes, status } from "../../lib/constants";
import type { AppContextType } from "../../types";
import { healthSchema, setupSchema } from "./schemas";

const utilityRouter = new OpenAPIHono<AppContextType>()
	.openapi(
		createRoute({
			tags: ["Utilities"],
			summary: "Health check endpoint",
			description:
				"Returns the health status of the service along with the current timestamp",
			method: "get",
			path: "/health",
			responses: {
				[status.OK.code]: {
					description: "Service is healthy",
					content: {
						[ContentTypes.JSON]: {
							schema: healthSchema,
						},
					},
				},
				[status.TOO_MANY_REQUESTS.code]: status.TOO_MANY_REQUESTS.response(),
				[status.INTERNAL_SERVER_ERROR.code]:
					status.INTERNAL_SERVER_ERROR.response(),
			},
		}),
		async (c) => {
			// logger.info("Health check endpoint called");
			// logger.debug("Health check endpoint called");
			// logger.warn("Health check endpoint called");
			// logger.error("Health check endpoint called");
			// logger.trace("Health check endpoint called");
			return c.json(
				{
					status: "ok",
					timestamp: new Date().toISOString(),
				},
				200,
			);
		},
	)
	.openapi(
		createRoute({
			tags: ["Utilities"],
			summary: "Setup status endpoint",
			description: "Returns whether any users exist in the system",
			method: "get",
			path: "/setup",
			responses: {
				[status.OK.code]: {
					description: "Setup status retrieved successfully",
					content: {
						[ContentTypes.JSON]: {
							schema: setupSchema,
						},
					},
				},
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

			return c.json({ hasUsers: result.length > 0 }, 200);
		},
	);

export default utilityRouter;
