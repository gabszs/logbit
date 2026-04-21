import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import {
	authorizationHeaderSchema,
	searchOptionsSchema,
	uuidV7IdParamSchema,
} from "@/common/schemas/baseSchemas";
import { db } from "@/db";
import { ContentTypes, status } from "@/lib/constants";
import { httpErrors } from "@/lib/errors";
import type { AuthAppContext } from "@/types";
import { SourceRepository } from "./repository";
import {
	sourcesListSuccessSchema,
	sourcesSchema,
	sourcesSuccessSchema,
	sourcesUpsertSchema,
	sourceUpdateSchema,
} from "./schemas";
import { SourceService } from "./service";

const sourcesRouter = new OpenAPIHono<
	AuthAppContext & {
		Variables: AuthAppContext["Variables"] & {
			service: SourceService;
			activeOrganizationId: string;
		};
	}
>();

sourcesRouter.use(async (c, next) => {
	const sourceRepository = new SourceRepository(db);
	const sourceService = new SourceService(sourceRepository);
	const session = c.get("session");
	const activeOrganizationId = session.activeOrganizationId;
	if (activeOrganizationId == null) {
		throw httpErrors.forbidden({
			detail: "No active organization",
		});
	}
	c.set("service", sourceService);
	c.set("activeOrganizationId", activeOrganizationId);
	await next();
});

sourcesRouter.openapi(
	createRoute({
		tags: ["Sources"],
		summary: "Get the source by ID",
		method: "get",
		path: "/sources/{id}",
		request: {
			params: uuidV7IdParamSchema,
			headers: authorizationHeaderSchema,
		},
		responses: {
			[status.OK.code]: status.OK.response(sourcesSchema),
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
		const source = await service.getById(id, {
			organizationId: activeOrganizationId,
		});

		if (!source)
			throw httpErrors.notFound({
				detail: "The requested source was not found",
			});

		return c.json(source);
	},
);

sourcesRouter.openapi(
	createRoute({
		tags: ["Sources"],
		summary: "Get all sources for the active organization",
		method: "get",
		path: "/sources",
		request: {
			query: searchOptionsSchema,
			headers: authorizationHeaderSchema,
		},
		responses: {
			[status.OK.code]: status.OK.response(sourcesListSuccessSchema),
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
		const sourceList = await service.getAll(query, {
			organizationId: activeOrganizationId,
		});

		return c.json({
			message: "Sources successfully retrieved",
			data: sourceList,
			metadata: query,
		});
	},
);

sourcesRouter.openapi(
	createRoute({
		tags: ["Sources"],
		summary: "Create a new source",
		method: "post",
		path: "/sources",
		request: {
			headers: authorizationHeaderSchema,
			body: {
				content: {
					[ContentTypes.JSON]: {
						schema: sourcesUpsertSchema,
					},
				},
			},
		},
		responses: {
			[status.CREATED.code]: status.CREATED.response(sourcesSuccessSchema),
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
		const source = await service.createSource(body, activeOrganizationId);

		return c.json(
			{
				message: "Source successfully created",
				data: source,
				metadata: null,
			},
			status.CREATED.code,
			{
				location: `${c.req.url}/${source.id}`,
			},
		);
	},
);

sourcesRouter.openapi(
	createRoute({
		tags: ["Sources"],
		summary: "Update a source",
		method: "patch",
		path: "/sources/{id}",
		request: {
			params: uuidV7IdParamSchema,
			headers: authorizationHeaderSchema,
			body: {
				content: {
					[ContentTypes.JSON]: {
						schema: sourceUpdateSchema,
					},
				},
			},
		},
		responses: {
			[status.OK.code]: status.OK.response(sourcesSuccessSchema),
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
		const source = await service.updateSource(id, body, activeOrganizationId);

		return c.json({
			message: "Source successfully updated",
			data: source,
			metadata: null,
		});
	},
);

sourcesRouter.openapi(
	createRoute({
		tags: ["Sources"],
		summary: "Delete a source",
		method: "delete",
		path: "/sources/{id}",
		request: {
			params: uuidV7IdParamSchema,
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
		await service.deleteSource(id, activeOrganizationId);

		return c.body(null, 204);
	},
);

export default sourcesRouter;
