import { z } from "zod";

export const searchOptionsSchema = z.object({
	page: z
		.preprocess(
			(val) => (val ? Number(val) : 1),
			z.number().int().max(200, { message: "Page must be <= 200" }),
		)
		.default(1)
		.describe("Page number"),
	page_size: z
		.preprocess(
			(val) => (val === "all" ? "all" : val ? Number(val) : 50),
			z.union([z.number().int(), z.literal("all")]),
		)
		.default(100)
		.describe(
			'Number of items per page (integer or "all" to return all records)',
		),
	ordering: z.string().default("-created_at").describe("Ordering field"),
	created_before: z.iso
		.datetime()
		.optional()
		.describe("Filter by creation date before (ISO 8601)"),
	created_on_or_before: z.iso
		.datetime()
		.optional()
		.describe("Filter by creation date on or before (ISO 8601)"),
	created_after: z.iso
		.datetime()
		.optional()
		.describe("Filter by creation date after (ISO 8601)"),
	created_on_or_after: z.iso
		.datetime()
		.optional()
		.describe("Filter by creation date on or after (ISO 8601)"),
});

export type searchOptionsSchemaType = z.infer<typeof searchOptionsSchema>;

const errorItemSchema = z.object({
	code: z.string().describe("Error code"),
	expected: z.string().describe("Expected type"),
	received: z.string().describe("Received type"),
	path: z.array(z.string().describe("Path to the field")),
	message: z.string().describe("Error message"),
});

export const zodValidationErrorSchema = z.object({
	errors: z.array(errorItemSchema),
	result: z.object({}).default({}),
});

export const pixelActivationSchema = z.object({
	id: z.string().describe("Unique identifier for the pixel activation"),
	status: z.string().describe("Status of the pixel activation"),
});

export const uuidIdParamSchema = z.object({
	id: z.uuid().openapi({
		description:
			"Unique UUID that identifies the entity. Must follow the RFC 4122 standard format.",
		default: "550e8400-e29b-41d4-a716-446655440000",
		format: "uuid",
		externalDocs: {
			url: "https://www.rfc-editor.org/rfc/rfc4122",
			description: "Official UUID standard specification (RFC 4122)",
		},
	}),
});

export const uuidV7IdParamSchema = z.object({
	id: z.uuidv7().openapi({
		description: "Unique UUIDv7 that identifies the source.",
		format: "uuid",
	}),
});

export const authorizationHeaderSchema = z.object({
	authorization: z
		.string()
		.refine((val) => val.toLowerCase().startsWith("bearer "), {
			message: "Authorization header must start with 'Bearer '",
		})
		.openapi({
			description:
				"Bearer token for authorization. Must start with 'Bearer ' followed by the JWT token.",
			default: "Bearer your_token",
			format: "bearer",
			externalDocs: {
				url: "https://jwt.io/introduction",
				description: "Learn more about JWT (JSON Web Tokens)",
			},
		}),
});

export const optionalAuthorizationHeaderSchema = z.object({
	authorization: z
		.string()
		.refine((val) => !val || val.toLowerCase().startsWith("bearer "), {
			message: "Authorization header must start with 'Bearer '",
		})
		.describe("Bearer token for authorization")
		.optional()
		.nullable(),
});

export const cookieAuthorizationSchema =
	optionalAuthorizationHeaderSchema.extend({
		cookie: z.string().optional().nullable().openapi({
			description:
				"Optional cookie for authentication. Can be used as an alternative to the Authorization header.",
			format: "cookie",
			example: "session=your_session_cookie",
		}),
	});

export const shortUuidParamSchema = z.object({
	id: z.string().regex(/^[a-zA-Z0-9]{6,32}$/, "Invalid ID"),
});

export const fileUploadSchema = z.object({
	file: z.any().openapi({
		description: "File to upload",
		type: "string",
		format: "binary",
	}),
});

export const fileUploadSuccessSchema = z
	.object({
		message: z.string().openapi({
			description: "Success message",
			example: "File uploaded successfully",
		}),
		data: z.object({
			file_key: z.string().openapi({
				description: "Key of the uploaded file",
				example: "uploads/550e8400-e29b-41d4-a716-446655440000",
			}),
		}),
		metadata: z.null(),
	})
	.openapi("DocumentSuccess");
