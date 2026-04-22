import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
	cookieAuthorizationSchema,
	searchOptionsSchema,
	uuidIdParamSchema,
} from "@/common/schemas/baseSchemas";
import { db } from "@/db";
import { ContentTypes, status } from "@/lib/constants";
import { httpErrors } from "@/lib/errors";
import type { AuthAppContext } from "@/types";
import { ConnectionRepository } from "./repository";
import {
	connectionListSuccessSchema,
	connectionSchema,
	connectionSuccessSchema,
	connectionUpsertSchema,
	connectionUpdateSchema,
} from "./schemas";
import { ConnectionService } from "./service";

const connectionsRouter = new OpenAPIHono<
	AuthAppContext & {
		Variables: AuthAppContext["Variables"] & {
			service: ConnectionService;
			activeOrganizationId: string;
		};
	}
>();

connectionsRouter.use(async (c, next) => {
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

connectionsRouter.openapi(
	createRoute({
		tags: ["Connections"],
		summary: "Get the connection by ID",
		method: "get",
		path: "/connections/{id}",
		request: {
			params: uuidIdParamSchema,
			headers: cookieAuthorizationSchema,
		},
		responses: {
			[status.OK.code]: status.OK.response(connectionSchema),
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

		return c.json(connection);
	},
);

connectionsRouter.openapi(
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
			[status.OK.code]: status.OK.response(connectionListSuccessSchema),
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

		return c.json({
			message: "Connection successfully retrieved",
			data: connections,
			metadata: query,
		});
	},
);

connectionsRouter.openapi(
	createRoute({
		tags: ["Connections"],
		summary: "Create a new integration",
		method: "post",
		path: "/integrations",
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
			[status.CREATED.code]: status.CREATED.response(connectionSuccessSchema),
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
		const connection = await service.createConnection(body, activeOrganizationId);

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
);

connectionsRouter.openapi(
	createRoute({
		tags: ["Connections"],
		summary: "Update an integration",
		method: "patch",
		path: "/integrations/{id}",
		request: {
			params: uuidIdParamSchema,
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
			[status.OK.code]: status.OK.response(connectionSuccessSchema),
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

		return c.json({
			message: "Connection successfully updated",
			data: connection,
			metadata: null,
		});
	},
);

connectionsRouter.openapi(
	createRoute({
		tags: ["Connections"],
		summary: "Delete an integration",
		method: "delete",
		path: "/integrations/{id}",
		request: {
			params: uuidIdParamSchema,
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
		const activeOrganizationId = c.get("activeOrganizationId")
		await service.deleteConnection(id, activeOrganizationId);

		return c.body(null, 204);
	},
);

export default connectionsRouter;
