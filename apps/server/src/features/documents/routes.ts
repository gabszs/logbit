import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { type InferSelectModel } from "drizzle-orm";
import {
	authorizationHeaderSchema,
	fileUploadSchema,
	fileUploadSuccessSchema,
	searchOptionsSchema,
	uuidIdParamSchema,
	zodValidationErrorSchema,
} from "../../common/schemas/baseSchemas";
import { checkForChanges, getValidatedRouteData } from "../../common/utils";
import { getDb } from "../../db";
import { type documents } from "../../db/documents";
import { HttpStatusCodes } from "../../lib/constants";
import { httpErrors } from "../../lib/errors";
import { type AppContext } from "../../types";
import { DocumentRepository } from "./repository";
import {
	descriminatedDocumentSchema,
	documentCreateSchema,
	documentListSuccessSchema,
	documentNoChangesSchema,
	documentNotFoundSchema,
	documentSuccessSchema,
	documentUpdateSchema,
} from "./schemas";
import { DocumentService } from "./service";

const documentsRoutes = new OpenAPIHono<AppContext>();

documentsRoutes.use("/v1/documents/*", async (c, next) => {
	const documentRepository = new DocumentRepository(getDb(c.env.D1));
	const documentService = new DocumentService(documentRepository);
	c.set("service", documentService);
	await next();
});

documentsRoutes.openapi(
	createRoute({
		tags: ["documents"],
		summary: "Get a document by id",
		method: "get",
		path: "/documents/{id}",
		request: {
			params: uuidIdParamSchema,
			headers: authorizationHeaderSchema,
		},
		responses: {
			[HttpStatusCodes.OK]: {
				description: "Returns a single document by id",
				content: {
					"application/json": {
						schema: descriminatedDocumentSchema,
					},
				},
			},
			[HttpStatusCodes.BAD_REQUEST]: {
				description: "Validation errors",
				content: {
					"application/json": {
						schema: zodValidationErrorSchema,
					},
				},
			},
			[HttpStatusCodes.NOT_FOUND]: {
				description: "Entity not found",
				content: {
					"application/json": {
						schema: documentNotFoundSchema,
					},
				},
			},
		},
	}),
	async (c: AppContext) => {
		const data = getValidatedRouteData(c);
		const user = c.get("user");
		const service: DocumentService = c.get("service");
		const document = await service.getById(data.params.id);
		if (!document) {
			throw httpErrors.entityNotFound("document");
		}

		return c.json(document, HttpStatusCodes.OK);
	},
);

documentsRoutes.openapi(
	createRoute({
		tags: ["documents"],
		summary: "Get a list of document",
		method: "get",
		path: "/documents",
		request: {
			headers: authorizationHeaderSchema,
			query: searchOptionsSchema,
		},
		responses: {
			[HttpStatusCodes.OK]: {
				description: "Returns a list of documents",
				content: {
					"application/json": {
						schema: documentListSuccessSchema,
					},
				},
			},
			[HttpStatusCodes.BAD_REQUEST]: {
				description: "Validation errors",
				content: {
					"application/json": {
						schema: zodValidationErrorSchema,
					},
				},
			},
		},
	}),
	async (c: AppContext) => {
		const data = getValidatedRouteData(c);
		const user = c.get("user");
		const service = c.get("service") as DocumentService;
		const documents = await service.getAll(data.query);

		return c.json(
			{
				message: "document Pixels retrieved successfully",
				data: documents,
				metadata: data.query,
			},
			HttpStatusCodes.OK,
		);
	},
);

documentsRoutes.openapi(
	createRoute({
		tags: ["documents"],
		summary: "Update a new document",
		method: "put",
		path: "/documents/{id}",
		request: {
			headers: authorizationHeaderSchema,
			params: uuidIdParamSchema,
			body: {
				content: {
					"application/json": {
						schema: documentUpdateSchema,
					},
				},
			},
		},
		responses: {
			[HttpStatusCodes.OK]: {
				description: "Returns the updated document",
				content: {
					"application/json": {
						schema: descriminatedDocumentSchema,
					},
				},
			},
			[HttpStatusCodes.BAD_REQUEST]: {
				description: "Validation errors",
				content: {
					"application/json": {
						schema: zodValidationErrorSchema,
					},
				},
			},
			[HttpStatusCodes.NOT_FOUND]: {
				description: "Integration not found",
				content: {
					"application/json": {
						schema: documentNotFoundSchema,
					},
				},
			},
			[HttpStatusCodes.UNPROCESSABLE_ENTITY]: {
				description: "No changes detected",
				content: {
					"application/json": {
						schema: documentNoChangesSchema,
					},
				},
			},
		},
	}),
	async (c: AppContext) => {
		const data = getValidatedRouteData(c);
		const user = c.get("user");
		const service = c.get("service") as DocumentService;
		const document = await service.getById(data.params.id);
		if (!document) {
			throw httpErrors.entityNotFound("document");
		}

		checkForChanges(c, data.body, document);
		try {
			await service.update(data.params.id, data.body);
		} catch (err: unknown) {
			const message = (err as Error)?.cause?.message || (err as Error)?.message || "";
			if (message.includes("UNIQUE constraint failed"))
				throw httpErrors.duplicateField("document", "name");
			throw err;
		}
		const updatedDocument = {
			...document,
			...data.body,
		};
		return c.json(updatedDocument, HttpStatusCodes.OK);
	},
);

documentsRoutes.openapi(
	createRoute({
		tags: ["documents"],
		summary: "Create a new document",
		method: "post",
		path: "/documents",
		request: {
			headers: authorizationHeaderSchema,
			body: {
				content: {
					"application/json": {
						schema: documentCreateSchema,
					},
				},
			},
		},
		responses: {
			[HttpStatusCodes.CREATED]: {
				description: "Returns the created document",
				content: {
					"application/json": {
						schema: documentSuccessSchema,
					},
				},
			},
			[HttpStatusCodes.BAD_REQUEST]: {
				description: "Validation errors",
				content: {
					"application/json": {
						schema: zodValidationErrorSchema,
					},
				},
			},
		},
	}),
	async (c: AppContext) => {
		const data = getValidatedRouteData(c);
		const user = c.get("user");
		const service: DocumentService = c.get("service");

		const documentToCreate = {
			id: crypto.randomUUID(),
			...data.body,
		};
		let createdDocument: InferSelectModel<typeof documents>;
		try {
			createdDocument = await service.create(documentToCreate);
		} catch (err: unknown) {
			const message = (err as Error)?.cause?.message || (err as Error)?.message || "";
			if (message.includes("UNIQUE constraint failed"))
				throw httpErrors.duplicateField("document", "name");
			if (message.includes("FOREIGN KEY constraint failed"))
				throw httpErrors.entityNotFound("document");
			throw err;
		}

		return c.json(
			{
				message: "document successfully created",
				data: createdDocument,
				metadata: null,
			},
			HttpStatusCodes.CREATED,
			{ location: `${c.req.url}/${createdDocument.id}` },
		);
	},
);

documentsRoutes.openapi(
	createRoute({
		tags: ["documents"],
		summary: "Upload an image for the document",
		method: "put",
		path: "/documents/{id}/upload-file",
		request: {
			headers: authorizationHeaderSchema,
			params: uuidIdParamSchema,
			body: {
				content: {
					"multipart/form-data": {
						schema: fileUploadSchema,
					},
				},
			},
		},
		responses: {
			[HttpStatusCodes.CREATED]: {
				description: "Returns the insert file key",
				content: {
					"application/json": {
						schema: fileUploadSuccessSchema,
					},
				},
			},
			[HttpStatusCodes.BAD_REQUEST]: {
				description: "Validation errors",
				content: {
					"application/json": {
						schema: zodValidationErrorSchema,
					},
				},
			},
		},
	}),
	async (c: AppContext) => {
		const data = getValidatedRouteData(c);
		const user = c.get("user");
		const service: DocumentService = c.get("service");
		const document = await service.getById(data.params.id);
		if (!document) {
			throw httpErrors.entityNotFound("document");
		}

		const body = await c.req.parseBody();
		const file = body["name"];

		if (!file || !(file instanceof File)) {
			throw httpErrors.badRequest("File uploaded is not a file");
		}

		const parsed = documentLogoFile.safeParse({ name: file });
		if (!parsed.success) {
			const errors = parsed.error.issues.map((err) => err.message).join(", ");
			throw httpErrors.badRequest(`File validation failed: ${errors}`);
		}

		const r2Object = await c.env.R2.put(`documents/${document.id}`, file, {
			httpMetadata: {
				contentType: file.type || "application/octet-stream",
				contentDisposition: `inline; filename="${file.name}"`,
			},
			customMetadata: {
				document_id: document.id,
				document_type: document.type,
				original_filename: file.name,
			},
		});
		if (!r2Object) {
			throw httpErrors.badRequest("Error uploading file");
		}

		return c.json(
			{
				message: "File successfully uploaded",
				data: { file_key: r2Object.key },
				metadata: null,
			},
			HttpStatusCodes.CREATED,
		);
	},
);

documentsRoutes.openapi(
	createRoute({
		tags: ["documents"],
		summary: "Delete the document",
		method: "delete",
		path: "/documents/{id}",
		request: {
			headers: authorizationHeaderSchema,
			params: uuidIdParamSchema,
		},
		responses: {
			[HttpStatusCodes.NO_CONTENT]: {
				description: "No content, document deleted successfully",
				content: {},
			},
			[HttpStatusCodes.BAD_REQUEST]: {
				description: "Validation errors",
				content: {
					"application/json": {
						schema: zodValidationErrorSchema,
					},
				},
			},
			[HttpStatusCodes.NOT_FOUND]: {
				description: "Integration not found",
				content: {
					"application/json": {
						schema: documentNotFoundSchema,
					},
				},
			},
		},
	}),
	async (c: AppContext) => {
		const data = getValidatedRouteData(c);
		const user = c.get("user");
		const service: DocumentService = c.get("service");
		const document = await service.getById(data.params.id);
		if (!document) {
			throw httpErrors.entityNotFound("document");
		}
		await service.delete(data.params.id);

		return c.body(null, HttpStatusCodes.NO_CONTENT);
	},
);

export default documentsRoutes;
