import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
	authorizationHeaderSchema,
	searchOptionsSchema,
	uuidIdParamSchema,
} from "@/common/schemas/baseSchemas";
import { db } from "@/db";
import { ContentTypes, status } from "@/lib/constants";
import { httpErrors } from "@/lib/errors";
import type { AuthAppContext } from "@/types";
import { IntegrationRepository } from "./repository";
import {
	integrationsListSuccessSchema,
	integrationsSchema,
	integrationsSuccessSchema,
	integrationsUpsertSchema,
	integrationUpdateSchema,
} from "./schemas";
import { IntegrationService } from "./service";

const integrationsRouter = new OpenAPIHono<
	AuthAppContext & {
		Variables: AuthAppContext["Variables"] & {
			service: IntegrationService;
			activeOrganizationId: string;
		};
	}
>();

integrationsRouter.use(async (c, next) => {
	const integrationRepository = new IntegrationRepository(db);
	const integrationService = new IntegrationService(integrationRepository);
	const session = c.get("session");
	const activeOrganizationId = session.activeOrganizationId;
	if (activeOrganizationId == null) {
		throw httpErrors.forbidden({
			detail: "No active organization",
		});
	}
	c.set("service", integrationService);
	c.set("activeOrganizationId", activeOrganizationId);
	await next();
});

integrationsRouter.openapi(
	createRoute({
		tags: ["Integrations"],
		summary: "Get the integration by ID",
		method: "get",
		path: "/integrations/{id}",
		request: {
			params: uuidIdParamSchema,
			headers: authorizationHeaderSchema,
		},
		responses: {
			[status.OK.code]: status.OK.response(integrationsSchema),
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
		const integration = await service.getById(id, {
			organizationId: activeOrganizationId,
		});

		if (!integration)
			throw httpErrors.notFound({
				detail: "The requested integration was not found",
			});

		return c.json(integration);
	},
);

integrationsRouter.openapi(
	createRoute({
		tags: ["Integrations"],
		summary: "Get all integrations for the active organization",
		method: "get",
		path: "/integrations",
		request: {
			query: searchOptionsSchema,
			headers: authorizationHeaderSchema,
		},
		responses: {
			[status.OK.code]: status.OK.response(integrationsListSuccessSchema),
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
		const integrations = await service.getAll(query, {
			organizationId: activeOrganizationId,
		});

		return c.json({
			message: "Integrations successfully retrieved",
			data: integrations,
			metadata: query,
		});
	},
);

integrationsRouter.openapi(
	createRoute({
		tags: ["Integrations"],
		summary: "Create a new integration",
		method: "post",
		path: "/integrations",
		request: {
			headers: authorizationHeaderSchema,
			body: {
				content: {
					[ContentTypes.JSON]: {
						schema: integrationsUpsertSchema,
					},
				},
			},
		},
		responses: {
			[status.CREATED.code]: status.CREATED.response(integrationsSuccessSchema),
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
		const integration = await service.createIntegration(body, activeOrganizationId);

		return c.json(
			{
				message: "Integration successfully created",
				data: integration,
				metadata: null,
			},
			status.CREATED.code,
			{
				location: `${c.req.url}/${integration.id}`,
			},
		);
	},
);

integrationsRouter.openapi(
	createRoute({
		tags: ["Integrations"],
		summary: "Update an integration",
		method: "patch",
		path: "/integrations/{id}",
		request: {
			params: uuidIdParamSchema,
			headers: authorizationHeaderSchema,
			body: {
				content: {
					[ContentTypes.JSON]: {
						schema: integrationUpdateSchema,
					},
				},
			},
		},
		responses: {
			[status.OK.code]: status.OK.response(integrationsSuccessSchema),
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
		const integration = await service.updateIntegration(
			id,
			body,
			activeOrganizationId,
		);

		return c.json({
			message: "Integration successfully updated",
			data: integration,
			metadata: null,
		});
	},
);

integrationsRouter.openapi(
	createRoute({
		tags: ["Integrations"],
		summary: "Delete an integration",
		method: "delete",
		path: "/integrations/{id}",
		request: {
			params: uuidIdParamSchema,
			headers: authorizationHeaderSchema,
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
		await service.deleteIntegration(id, activeOrganizationId);

		return c.body(null, 204);
	},
);

export default integrationsRouter;
