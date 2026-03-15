import { createSelectSchema } from "drizzle-zod";
import z from "zod";
import {
	createNoChangesSchema,
	createNotFoundSchema,
	searchOptionsSchema,
} from "../../common/schemas/baseSchemas";
import { documents } from "../../db/documents";

const documentSchema = createSelectSchema(documents).extend({
	id: z.uuid().openapi({
		description: "Unique identifier for the document",
		example: "a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6",
	}),
	userId: z.uuid().openapi({
		description: "Unique identifier for the user who owns the document",
		example: "z9y8x7w6-v5u4-t3s2-r1q0-p9o8n7m6l5k4",
	}),
});

// Campos a serem omitidos
const omitFields = {
	id: true,
	s3_file_key: true,
	// userId: true,
	createdAt: true,
	updatedAt: true,
} as const;

// Schemas para CREATE (sem os campos omitidos)
const identityDocumentCreate = documentSchema.omit(omitFields).extend({
	type: z.literal("identity"),
	metadata: z.object({
		full_name: z.string().min(3),
		cpf: z.string().regex(/^\d{11}$/),
		rg: z.string().optional(),
	}),
});

const addressProofDocumentCreate = documentSchema.omit(omitFields).extend({
	type: z.literal("address_proof"),
	metadata: z.object({
		address: z.string(),
		zip_code: z.string().regex(/^\d{8}$/),
		city: z.string().optional(),
		state: z.string().length(2).optional(),
	}),
});

const cnpjIdentityDocumentCreate = documentSchema.omit(omitFields).extend({
	type: z.literal("cnpj_identity"),
	metadata: z.object({
		cnpj: z.string().regex(/^\d{14}$/),
		legal_name: z.string(),
		trade_name: z.string().optional(),
	}),
});

const incomeReceiptDocumentCreate = documentSchema.omit(omitFields).extend({
	type: z.literal("income_receipt"),
	metadata: z.object({
		amount: z.number().positive(),
		issuer: z.string(),
		reference_month: z.string().optional(),
	}),
});

const receiptDocumentCreate = documentSchema.omit(omitFields).extend({
	type: z.literal("receipts"),
	metadata: z.object({
		amount: z.number().positive(),
		issuer: z.string(),
		reference_month: z.string().optional(),
	}),
});

const companyDocumentsCreate = documentSchema.omit(omitFields).extend({
	type: z.literal("company_documents"),
	metadata: z.object({}).optional(),
});

// Schemas originais para SELECT (com todos os campos)
const identityDocument = documentSchema.extend({
	type: z.literal("identity"),
	metadata: z.object({
		full_name: z.string().min(3),
		cpf: z.string().regex(/^\d{11}$/),
		rg: z.string().optional(),
	}),
});

const addressProofDocument = documentSchema.extend({
	type: z.literal("address_proof"),
	metadata: z.object({
		address: z.string(),
		zip_code: z.string().regex(/^\d{8}$/),
		city: z.string().optional(),
		state: z.string().length(2).optional(),
	}),
});

const cnpjIdentityDocument = documentSchema.extend({
	type: z.literal("cnpj_identity"),
	metadata: z.object({
		cnpj: z.string().regex(/^\d{14}$/),
		legal_name: z.string(),
		trade_name: z.string().optional(),
	}),
});

const incomeReceiptDocument = documentSchema.extend({
	type: z.literal("income_receipt"),
	metadata: z.object({
		amount: z.number().positive(),
		issuer: z.string(),
		reference_month: z.string().optional(),
	}),
});

const receiptDocument = documentSchema.extend({
	type: z.literal("receipts"),
	metadata: z.object({
		amount: z.number().positive(),
		issuer: z.string(),
		reference_month: z.string().optional(),
	}),
});

const companyDocuments = documentSchema.extend({
	type: z.literal("company_documents"),
	metadata: z.object({}).optional(),
});

// Schema completo para SELECT
export const descriminatedDocumentSchema = z
	.discriminatedUnion("type", [
		identityDocument,
		addressProofDocument,
		cnpjIdentityDocument,
		incomeReceiptDocument,
		receiptDocument,
		companyDocuments,
	])
	.openapi("Document");

// Schema para CREATE (sem campos omitidos)
export const documentCreateSchema = z
	.discriminatedUnion("type", [
		identityDocumentCreate,
		addressProofDocumentCreate,
		cnpjIdentityDocumentCreate,
		incomeReceiptDocumentCreate,
		receiptDocumentCreate,
		companyDocumentsCreate,
	])
	.openapi("DocumentCreate");

// Schema para UPDATE (sem campos omitidos + partial)
export const documentUpdateSchema = z
	.discriminatedUnion("type", [
		identityDocumentCreate.partial(),
		addressProofDocumentCreate.partial(),
		cnpjIdentityDocumentCreate.partial(),
		incomeReceiptDocumentCreate.partial(),
		receiptDocumentCreate.partial(),
		companyDocumentsCreate.partial(),
	])
	.openapi("DocumentUpdate");

export const documentSuccessSchema = z
	.object({
		message: z.string(),
		data: descriminatedDocumentSchema,
		metadata: searchOptionsSchema.nullable(),
	})
	.openapi("DocumentSuccess");

export const documentListSuccessSchema = documentSuccessSchema
	.extend({
		data: z.array(descriminatedDocumentSchema),
	})
	.openapi("DocumentListSuccess");

export type Document = z.infer<typeof descriminatedDocumentSchema>;

export const documentNotFoundSchema = createNotFoundSchema("document");
export type DocumentNotFound = z.infer<typeof documentNotFoundSchema>;

export const documentNoChangesSchema = createNoChangesSchema("document");
export type DocumentNoChanges = z.infer<typeof documentNoChangesSchema>;
