import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HttpStatusCodes } from "../../lib/constants";
import { type AppContext } from "../../types";
import { healthSchema } from "./schemas";

const utilityRoutes = new OpenAPIHono<AppContext>();

const debugHandler = async (c: AppContext) => {
	const req = c.req;
	const url = req.url;
	const method = req.method.toUpperCase();
	const headers: Record<string, string> = {};
	for (const [key, value] of req.raw.headers.entries()) {
		headers[key] = value;
	}
	const cf = (req.raw.cf || {}) as Record<string, unknown>;
	for (const [key, value] of Object.entries(cf)) {
		if (value != null && typeof value !== "object") {
			headers[`cf-${key}`] = String(value);
		}
	}
	let bodyText = "";
	console.log("headers:", Object.entries(headers));
	try {
		const body = await req.json();
		bodyText = JSON.stringify(body, null, 2);
		console.log("body:", bodyText);
	} catch {}
	const headerString = Object.entries(headers)
		.map(([key, value]) => `-H "${key}: ${value}"`)
		.join(" \\\n ");
	const dataPart = bodyText ? ` \\\n -d '${bodyText.replace(/'/g, "'\\''")}'` : "";
	const curl = `curl -X ${method} "${url}" \\\n ${headerString}${dataPart}`;
	console.log("curl:", curl);

	return c.text(curl);
};

utilityRoutes.openapi(
	createRoute({
		tags: ["utilities"],
		summary: "Health check endpoint",
		description: "Returns the health status of the service along with the current timestamp",
		method: "get",
		path: "/health",
		responses: {
			[HttpStatusCodes.OK]: {
				description: "Service is healthy and operational",
				content: {
					"application/json": {
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
				metadata: c.env.VERSION_METADATA,
			},
			HttpStatusCodes.OK,
		);
	},
);

utilityRoutes.openapi(
	createRoute({
		tags: ["utilities"],
		summary: "Echo request as a cURL command (GET)",
		description: "Returns an equivalent curl command for GET requests",
		method: "get",
		path: "/debug",
		responses: {
			[HttpStatusCodes.OK]: {
				description: "Returns an equivalent curl command",
				content: {
					"text/plain": {
						schema: { type: "string" as const },
					},
				},
			},
		},
	}),
	debugHandler,
);

utilityRoutes.openapi(
	createRoute({
		tags: ["utilities"],
		summary: "Echo request as a cURL command (POST)",
		description: "Returns an equivalent curl command for POST requests",
		method: "post",
		path: "/debug",
		request: {
			body: {
				content: {
					"application/json": {
						schema: { type: "object" as const },
					},
				},
			},
		},
		responses: {
			[HttpStatusCodes.OK]: {
				description: "Returns an equivalent curl command",
				content: {
					"text/plain": {
						schema: { type: "string" as const },
					},
				},
			},
		},
	}),
	debugHandler,
);

export default utilityRoutes;
