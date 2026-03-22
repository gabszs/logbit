import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
	ContentTypes,
	HttpStatusCodes,
	HttpStatusDescriptions,
} from "../../lib/constants";
import type { AppContext } from "../../types";
import { healthSchema } from "./schemas";

const utilityRouter = new OpenAPIHono<AppContext>();

utilityRouter.openapi(
	createRoute({
		tags: ["Utilities"],
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
		return c.json(
			{
				status: "ok",
				timestamp: new Date().toISOString(),
			},
			HttpStatusCodes.OK,
		);
	},
);

export default utilityRouter;
