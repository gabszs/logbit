import { $, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import {
	cookieAuthorizationSchema,
	searchOptionsSchema,
	uuidV7IdParamSchema,
} from "@/common/schemas/baseSchemas";
import { db } from "@/db";
import { ConnectionRepository } from "@/features/connections/repository";
import { ContentTypes, status } from "@/lib/constants";
import { httpErrors } from "@/lib/errors";
import type { AuthAppContextType } from "@/types";
import { SourceRepository } from "./repository";
import {
	sourcesListSuccessSchema,
	sourcesSchema,
	sourcesSuccessSchema,
	sourcesUpsertSchema,
	sourceUpdateSchema,
} from "./schemas";
import { SourceService } from "./service";

type SourceContext = AuthAppContextType & {
	Variables: AuthAppContextType["Variables"] & {
		service: SourceService;
		activeOrganizationId: string;
	};
};

const sourcesContextMiddleware = createMiddleware<SourceContext>(
	async (c, next) => {
		const sourceRepository = new SourceRepository(db);
		const connectionRepository = new ConnectionRepository(db);
		const sourceService = new SourceService(
			sourceRepository,
			connectionRepository,
		);
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
	},
);

const sourcesRouter = $(
	new OpenAPIHono<SourceContext>().use(sourcesContextMiddleware),
)
	.openapi(
		createRoute({
			tags: ["Sources"],
			summary: "Get the source by ID",
			method: "get",
			path: "/sources/{id}",
			request: {
				params: uuidV7IdParamSchema,
				headers: cookieAuthorizationSchema,
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
	)
	.openapi(
		createRoute({
			tags: ["Sources"],
			summary: "Get all sources for the active organization",
			method: "get",
			path: "/sources",
			request: {
				query: searchOptionsSchema,
				headers: cookieAuthorizationSchema,
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
	)
	.openapi(
		createRoute({
			tags: ["Sources"],
			summary: "Create a new source",
			method: "post",
			path: "/sources",
			request: {
				headers: cookieAuthorizationSchema,
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
	)
	.openapi(
		createRoute({
			tags: ["Sources"],
			summary: "Update a source",
			method: "patch",
			path: "/sources/{id}",
			request: {
				params: uuidV7IdParamSchema,
				headers: cookieAuthorizationSchema,
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
	)
	.openapi(
		createRoute({
			tags: ["Sources"],
			summary: "Delete a source",
			method: "delete",
			path: "/sources/{id}",
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
			await service.deleteSource(id, activeOrganizationId);

			return c.body(null, 204);
		},
	);

export default sourcesRouter;
