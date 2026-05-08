import { expect } from "bun:test";
import { eq } from "drizzle-orm";
import type { AuthContext, IntegrationType } from "../connections/helpers";
import {
	buildIntegrationPayload,
	createAuthContextWithActiveOrganization,
	createIntegration,
	createSecondOrganization,
	getIntegrationTestRuntime,
	requestWithAuth,
	setupIntegrationTestLifecycle,
} from "../connections/helpers";

const { models } = await import("@/db/models");

const defaultLogConfig = {
	database: null,
	table: null,
	defaultSelectQuery:
		"Timestamp, ServiceName as service, SeverityText as level, Body",
	defaultOrderByQuery: "Timestamp DESC",
	severityField: "SeverityText",
	resourceAttributesField: "ResourceAttributes",
	logAttributesField: "LogAttributes",
	timestampQueryField: "Timestamp",
	serviceNameField: "ServiceName",
	bodyField: "Body",
	traceIdField: "TraceId",
	spanIdField: "SpanId",
	luceneImplicitColumnField: "Body",
	traceSourceId: null,
	metricSourceId: null,
};

export {
	buildIntegrationPayload,
	createAuthContextWithActiveOrganization,
	createIntegration,
	createSecondOrganization,
	getIntegrationTestRuntime,
	requestWithAuth,
	setupIntegrationTestLifecycle,
};

export const buildLogSourcePayload = (
	connectionId: string,
	overrides?: {
		name?: string;
		config?: Partial<{
			database: string | null;
			table: string | null;
			defaultSelectQuery: string;
			defaultOrderByQuery: string;
			severityField: string;
			resourceAttributesField: string;
			logAttributesField: string;
			timestampQueryField: string;
			serviceNameField: string;
			bodyField: string;
			traceIdField: string;
			spanIdField: string;
			luceneImplicitColumnField: string;
			traceSourceId: string | null;
			metricSourceId: string | null;
		}>;
	},
) => ({
	name: overrides?.name ?? `logs-${Bun.randomUUIDv7()}`,
	type: "log",
	connectionId,
	config: overrides?.config ?? {
		severityField: "SeverityText",
	},
});

export const createSource = async ({
	headers,
	connectionId,
	name,
	config,
}: {
	headers: Headers;
	connectionId: string;
	name?: string;
	config?: Parameters<typeof buildLogSourcePayload>[1]["config"];
}) => {
	const payload = buildLogSourcePayload(connectionId, { name, config });
	const res = await requestWithAuth("/v1/sources", {
		method: "POST",
		headers,
		body: payload,
	});

	expect(res.status).toBe(201);
	const body = (await res.json()) as {
		data: {
			id: string;
			name: string;
			type: "log";
			connectionId: string;
			config: {
				database: string | null;
				table: string | null;
				defaultSelectQuery: string;
				defaultOrderByQuery: string;
				severityField: string;
				resourceAttributesField: string;
				logAttributesField: string;
				timestampQueryField: string;
				serviceNameField: string;
				bodyField: string;
				traceIdField: string;
				spanIdField: string;
				luceneImplicitColumnField: string;
				traceSourceId: string | null;
				metricSourceId: string | null;
			};
		};
	};
	return { id: body.data.id, body };
};

export const createConnection = async ({
	headers,
	type = "clickhouse",
	name,
	isActive,
}: {
	headers: Headers;
	type?: IntegrationType;
	name?: string;
	isActive?: boolean;
}) => {
	const payload = buildIntegrationPayload(type, { name, isActive });
	const res = await requestWithAuth("/v1/connections", {
		method: "POST",
		headers,
		body: payload,
	});

	expect(res.status).toBe(201);
	const body = (await res.json()) as { data: { id: string } };
	return body.data.id;
};

export const getSourceRow = async (id: string) => {
	const runtime = getIntegrationTestRuntime();
	const rows = await runtime.db
		.select()
		.from(models.sources)
		.where(eq(models.sources.id, id))
		.limit(1);

	return rows[0] ?? null;
};

export const insertClickhouseConnectionForOrganization = async ({
	organizationId,
	name = "other-clickhouse",
}: {
	organizationId: string;
	name?: string;
}) => {
	const runtime = getIntegrationTestRuntime();
	const id = Bun.randomUUIDv7();
	await runtime.db.insert(models.connections).values({
		id,
		name,
		type: "clickhouse",
		organizationId,
		config: {
			url: "http://localhost:8123",
			database: "loglog_test",
			username: "default",
			password: "",
		},
		isActive: true,
	});

	return id;
};

export const insertLogSourceForOrganization = async ({
	organizationId,
	connectionId,
	name = "other-source",
}: {
	organizationId: string;
	connectionId: string;
	name?: string;
}) => {
	const runtime = getIntegrationTestRuntime();
	const id = Bun.randomUUIDv7();
	await runtime.db.insert(models.sources).values({
		id,
		name,
		type: "log",
		organizationId,
		connectionId,
		config: defaultLogConfig,
	});

	return id;
};

export const createAuthContextWithClickhouseConnection = async (
	email: string,
): Promise<AuthContext & { connectionId: string }> => {
	const ctx = await createAuthContextWithActiveOrganization(email);
	const connectionId = await createIntegration({
		headers: ctx.headers,
		type: "clickhouse",
	});

	return { ...ctx, connectionId };
};
