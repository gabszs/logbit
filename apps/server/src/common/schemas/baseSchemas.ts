import { z } from "zod";
import { HttpStatusCodes, HttpStatusPhrases } from "../../lib/constants";

export const searchOptionsSchema = z.object({
	page: z
		.preprocess(
			(val) => (val ? Number(val) : 1),
			z.number().int().max(200, { message: "Page must be <= 200" }),
		)
		.default(1)
		.describe("Page number"),
	page_size: z
		.preprocess((val) => (val ? Number(val) : 50), z.number().int())
		.default(100)
		.describe("Number of items per page"),
	ordering: z.string().default("-created_at").describe("Ordering field"),
	created_before: z.iso.datetime().optional().describe("Filter by creation date before (ISO 8601)"),
	created_on_or_before: z.iso
		.datetime()
		.optional()
		.describe("Filter by creation date on or before (ISO 8601)"),
	created_after: z.iso.datetime().optional().describe("Filter by creation date after (ISO 8601)"),
	created_on_or_after: z.iso
		.datetime()
		.optional()
		.describe("Filter by creation date on or after (ISO 8601)"),
});

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
			metadata: {
				security: "JWT",
				tokenType: "access_token",
				requiresAuthentication: true,
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

export const shortUuidParamSchema = z.object({
	id: z.string().regex(/^[a-zA-Z0-9]{6,32}$/, "Invalid ID"),
});

export function createNotFoundSchema(resourceName: string) {
	return z
		.object({
			code: z.string().openapi({
				description: "RFC Status phrase",
				example: HttpStatusPhrases.NOT_FOUND,
			}),
			message: z.string().openapi({
				description: "Detailed error message",
				example: `The provided ${resourceName} was not found`,
			}),
			status: z.string().openapi({
				description: "RFC Status phrase",
				example: HttpStatusCodes.NOT_FOUND,
			}),
		})
		.openapi({
			description: `${resourceName} not found response`,
		});
}
export function createNoChangesSchema(resourceName: string) {
	return z
		.object({
			error: z.string().openapi({
				description: "RFC Status phrase",
				example: HttpStatusPhrases.UNPROCESSABLE_ENTITY,
			}),
			message: z.string().openapi({
				description: "Detailed error message",
				example: `No changes were detected in the ${resourceName} payload`,
			}),
			code: z.string().openapi({
				description: "RFC Status phrase",
				example: HttpStatusCodes.UNPROCESSABLE_ENTITY,
			}),
		})
		.openapi({
			description: `No changes detected response for ${resourceName}`,
		});
}

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
