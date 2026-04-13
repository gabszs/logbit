import z from "zod";

export const setupSchema = z.object({
	hasUsers: z.boolean().openapi({
		example: false,
		description: "Whether any users exist in the system",
	}),
});

export const healthSchema = z.object({
	status: z.string().openapi({
		example: "ok",
		description: "Health status of the service",
	}),
	timestamp: z.string().openapi({
		example: "2024-01-01T00:00:00.000Z",
		description: "Current server timestamp in ISO 8601 format",
	}),
});
