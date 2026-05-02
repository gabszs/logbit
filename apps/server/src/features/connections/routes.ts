import { $, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import {
	cookieAuthorizationSchema,
	searchOptionsSchema,
	uuidV7IdParamSchema,
} from "@/common/schemas/baseSchemas";
import { db } from "@/db";
import { ContentTypes, status } from "@/lib/constants";
import { httpErrors } from "@/lib/errors";
import type { AuthAppContextType } from "@/types";
import { ConnectionRepository } from "./repository";
import {
	connectionListSuccessSchema,
	connectionResponseSchema,
	connectionSuccessSchema,
	connectionTestResultSchema,
	connectionUpdateSchema,
	connectionUpsertSchema,
	testClickhouseConfigSchema,
} from "./schemas";
import { ConnectionService } from "./service";

type ConnectionContext = AuthAppContextType & {
	Variables: AuthAppContextType["Variables"] & {
		service: ConnectionService;
		activeOrganizationId: string;
	};
};

const connectionContextMiddleware = createMiddleware(async (c, next) => {
	const connectionRepository = new ConnectionRepository(db);
	const connectionService = new ConnectionService(connectionRepository);
	const session = c.get("session");
	const activeOrganizationId = session.activeOrganizationId;

	if (activeOrganizationId == null) {
		throw httpErrors.forbidden({
			detail: "No active organization",
		});
	}

	c.set("service", connectionService);
	c.set("activeOrganizationId", activeOrganizationId);
	await next();
});

const connectionsRouter = $(
	new OpenAPIHono<ConnectionContext>().use(connectionContextMiddleware),
)
	.openapi(
		createRoute({
			tags: ["Connections"],
			summary: "Ping a ClickHouse connection using raw credentials",
			method: "post",
			path: "/connections/ping",
			request: {
				headers: cookieAuthorizationSchema,
				body: {
					content: {
						[ContentTypes.JSON]: {
							schema: testClickhouseConfigSchema,
						},
					},
				},
			},
			responses: {
				[status.OK.code]: {
					description: "Connection successful",
					content: {
						[ContentTypes.JSON]: {
							schema: connectionTestResultSchema,
						},
					},
				},
				[status.UNAUTHORIZED.code]: status.UNAUTHORIZED.response(),
				[status.FORBIDDEN.code]: status.FORBIDDEN.response({
					detail: "No active organization",
				}),
				[status.BAD_REQUEST.code]: status.BAD_REQUEST.response(),
				[status.TOO_MANY_REQUESTS.code]: status.TOO_MANY_REQUESTS.response(),
				[status.INTERNAL_SERVER_ERROR.code]:
					status.INTERNAL_SERVER_ERROR.response(),
			},
		}),
		async (c) => {
			const config = c.req.valid("json");
			return c.json(await c.get("service").testClickhousePing(config), 200);
		},
	)
	.openapi(
		createRoute({
			tags: ["Connections"],
			summary: "Execute a simple query test on a ClickHouse connection",
			method: "post",
			path: "/connections/query-test",
			request: {
				headers: cookieAuthorizationSchema,
				body: {
					content: {
						[ContentTypes.JSON]: {
							schema: testClickhouseConfigSchema,
						},
					},
				},
			},
			responses: {
				[status.OK.code]: {
					description: "Query executed successfully",
					content: {
						[ContentTypes.JSON]: {
							schema: connectionTestResultSchema,
						},
					},
				},
				[status.UNAUTHORIZED.code]: status.UNAUTHORIZED.response(),
				[status.FORBIDDEN.code]: status.FORBIDDEN.response({
					detail: "No active organization",
				}),
				[status.BAD_REQUEST.code]: status.BAD_REQUEST.response(),
				[status.TOO_MANY_REQUESTS.code]: status.TOO_MANY_REQUESTS.response(),
				[status.INTERNAL_SERVER_ERROR.code]:
					status.INTERNAL_SERVER_ERROR.response(),
			},
		}),
		async (c) => {
			const config = c.req.valid("json");
			return c.json(await c.get("service").testClickhouseQuery(config), 200);
		},
	)
	.openapi(
		createRoute({
			tags: ["Connections"],
			summary: "Get the connection by ID",
			method: "get",
			path: "/connections/{id}",
			request: {
				params: uuidV7IdParamSchema,
				headers: cookieAuthorizationSchema,
			},
			responses: {
				[status.OK.code]: {
					description: "Connection retrieved successfully",
					content: {
						[ContentTypes.JSON]: {
							schema: connectionResponseSchema,
						},
					},
				},
				[status.NOT_FOUND.code]: status.NOT_FOUND.response(),
				[status.UNAUTHORIZED.code]: status.UNAUTHORIZED.response(),
				[status.FORBIDDEN.code]: status.FORBIDDEN.response({
					detail: "No active organization",
				}),
				[status.BAD_REQUEST.code]: status.BAD_REQUEST.response(),
				[status.TOO_MANY_REQUESTS.code]: status.TOO_MANY_REQUESTS.response(),
				[status.INTERNAL_SERVER_ERROR.code]:
					status.INTERNAL_SERVER_ERROR.response(),
			},
		}),
		async (c) => {
			const { id } = c.req.param();
			const service = c.get("service");
			const activeOrganizationId = c.get("activeOrganizationId");
			const connection = await service.getById(id, {
				organizationId: activeOrganizationId,
			});

			if (!connection)
				throw httpErrors.notFound({
					detail: "The requested connection was not found",
				});

			return c.json(connection, 200);
		},
	)
	.openapi(
		createRoute({
			tags: ["Connections"],
			summary: "Get all connection for the active organization",
			method: "get",
			path: "/connections",
			request: {
				query: searchOptionsSchema,
				headers: cookieAuthorizationSchema,
			},
			responses: {
				[status.OK.code]: {
					description: "Connections retrieved successfully",
					content: {
						[ContentTypes.JSON]: {
							schema: connectionListSuccessSchema,
						},
					},
				},
				[status.UNAUTHORIZED.code]: status.UNAUTHORIZED.response(),
				[status.FORBIDDEN.code]: status.FORBIDDEN.response({
					detail: "No active organization",
				}),
				[status.BAD_REQUEST.code]: status.BAD_REQUEST.response(),
				[status.TOO_MANY_REQUESTS.code]: status.TOO_MANY_REQUESTS.response(),
				[status.INTERNAL_SERVER_ERROR.code]:
					status.INTERNAL_SERVER_ERROR.response(),
			},
		}),
		async (c) => {
			const query = c.req.valid("query");
			const service = c.get("service");
			const activeOrganizationId = c.get("activeOrganizationId");
			const connections = await service.getAll(query, {
				organizationId: activeOrganizationId,
			});

			return c.json(
				{
					message: "Connection successfully retrieved",
					data: connections,
					metadata: query,
				},
				200,
			);
		},
	)
	.openapi(
		createRoute({
			tags: ["Connections"],
			summary: "Create a new integration",
			method: "post",
			path: "/connections",
			request: {
				headers: cookieAuthorizationSchema,
				body: {
					content: {
						[ContentTypes.JSON]: {
							schema: connectionUpsertSchema,
						},
					},
				},
			},
			responses: {
				[status.CREATED.code]: {
					description: "Connection successfully created",
					content: {
						[ContentTypes.JSON]: {
							schema: connectionSuccessSchema,
						},
					},
				},
				[status.NOT_FOUND.code]: status.NOT_FOUND.response(),
				[status.BAD_REQUEST.code]: status.BAD_REQUEST.response(),
				[status.UNAUTHORIZED.code]: status.UNAUTHORIZED.response(),
				[status.FORBIDDEN.code]: status.FORBIDDEN.response({
					detail: "No active organization",
				}),
				[status.TOO_MANY_REQUESTS.code]: status.TOO_MANY_REQUESTS.response(),
				[status.INTERNAL_SERVER_ERROR.code]:
					status.INTERNAL_SERVER_ERROR.response(),
			},
		}),
		async (c) => {
			const body = c.req.valid("json");
			const service = c.get("service");
			const activeOrganizationId = c.get("activeOrganizationId");
			const connection = await service.createConnection(
				body,
				activeOrganizationId,
			);

			return c.json(
				{
					message: "Connection successfully created",
					data: connection,
					metadata: null,
				},
				status.CREATED.code,
				{
					location: `${c.req.url}/${connection.id}`,
				},
			);
		},
	)
	.openapi(
		createRoute({
			tags: ["Connections"],
			summary: "Update an integration",
			method: "patch",
			path: "/connections/{id}",
			request: {
				params: uuidV7IdParamSchema,
				headers: cookieAuthorizationSchema,
				body: {
					content: {
						[ContentTypes.JSON]: {
							schema: connectionUpdateSchema,
						},
					},
				},
			},
			responses: {
				[status.OK.code]: {
					description: "Connection successfully updated",
					content: {
						[ContentTypes.JSON]: {
							schema: connectionSuccessSchema,
						},
					},
				},
				[status.NOT_FOUND.code]: status.NOT_FOUND.response(),
				[status.BAD_REQUEST.code]: status.BAD_REQUEST.response(),
				[status.UNAUTHORIZED.code]: status.UNAUTHORIZED.response(),
				[status.FORBIDDEN.code]: status.FORBIDDEN.response({
					detail: "No active organization",
				}),
				[status.TOO_MANY_REQUESTS.code]: status.TOO_MANY_REQUESTS.response(),
				[status.INTERNAL_SERVER_ERROR.code]:
					status.INTERNAL_SERVER_ERROR.response(),
			},
		}),
		async (c) => {
			const { id } = c.req.param();
			const body = c.req.valid("json");
			const service = c.get("service");
			const activeOrganizationId = c.get("activeOrganizationId");
			const connection = await service.updateConnection(
				id,
				body,
				activeOrganizationId,
			);

			return c.json(
				{
					message: "Connection successfully updated",
					data: connection,
					metadata: null,
				},
				200,
			);
		},
	)
	.openapi(
		createRoute({
			tags: ["Connections"],
			summary: "Delete an integration",
			method: "delete",
			path: "/connections/{id}",
			request: {
				params: uuidV7IdParamSchema,
				headers: cookieAuthorizationSchema,
			},
			responses: {
				[status.NO_CONTENT.code]: status.NO_CONTENT.response(),
				[status.NOT_FOUND.code]: status.NOT_FOUND.response(),
				[status.UNAUTHORIZED.code]: status.UNAUTHORIZED.response(),
				[status.FORBIDDEN.code]: status.FORBIDDEN.response({
					detail: "No active organization",
				}),
				[status.TOO_MANY_REQUESTS.code]: status.TOO_MANY_REQUESTS.response(),
				[status.INTERNAL_SERVER_ERROR.code]:
					status.INTERNAL_SERVER_ERROR.response(),
			},
		}),
		async (c) => {
			const { id } = c.req.param();
			const service = c.get("service");
			const activeOrganizationId = c.get("activeOrganizationId");
			await service.deleteConnection(id, activeOrganizationId);

			return c.body(null, 204);
		},
	);

export default connectionsRouter;
