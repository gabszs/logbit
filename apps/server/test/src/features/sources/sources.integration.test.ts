import { describe, expect, it } from "bun:test";
import {
	buildLogSourcePayload,
	createAuthContextWithActiveOrganization,
	createAuthContextWithClickhouseConnection,
	createConnection,
	createIntegration,
	createSecondOrganization,
	createSource,
	getSourceRow,
	insertClickhouseConnectionForOrganization,
	insertLogSourceForOrganization,
	requestWithAuth,
	setupIntegrationTestLifecycle,
} from "./helpers";

describe("Sources integration", () => {
	setupIntegrationTestLifecycle();

	it("creates log source with clickhouse connection from the active organization", async () => {
		const ctx = await createAuthContextWithClickhouseConnection(
			"sources-create-clickhouse@example.com",
		);
		const payload = buildLogSourcePayload(ctx.connectionId, {
			name: "logs-main",
		});

		const res = await requestWithAuth("/v1/sources", {
			method: "POST",
			headers: ctx.headers,
			body: payload,
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			data: {
				name: string;
				type: string;
				connectionId: string;
				organizationId: string;
				config: {
					defaultSelectQuery: string;
					traceSourceId: string | null;
					metricSourceId: string | null;
				};
			};
		};
		expect(body.data.name).toBe("logs-main");
		expect(body.data.type).toBe("log");
		expect(body.data.connectionId).toBe(ctx.connectionId);
		expect(body.data.organizationId).toBe(ctx.organizationId);
		expect(body.data.config.defaultSelectQuery).toBe(
			"Timestamp, ServiceName as service, SeverityText as level, Body",
		);
		expect(body.data.config.traceSourceId).toBeNull();
		expect(body.data.config.metricSourceId).toBeNull();
	});

	it("creates log source with inactive clickhouse connection", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"sources-create-inactive-clickhouse@example.com",
		);
		const connectionId = await createConnection({
			headers: ctx.headers,
			type: "clickhouse",
			name: "inactive-clickhouse",
			isActive: false,
		});

		const res = await requestWithAuth("/v1/sources", {
			method: "POST",
			headers: ctx.headers,
			body: buildLogSourcePayload(connectionId),
		});

		expect(res.status).toBe(201);
	});

	it("returns 400 when creating source with non-clickhouse connection", async () => {
		const ctx = await createAuthContextWithActiveOrganization(
			"sources-create-resend-rejected@example.com",
		);
		const connectionId = await createIntegration({
			headers: ctx.headers,
			type: "resend",
		});

		const res = await requestWithAuth("/v1/sources", {
			method: "POST",
			headers: ctx.headers,
			body: buildLogSourcePayload(connectionId),
		});

		expect(res.status).toBe(400);
	});

	it("returns 404 when creating source with connection from another organization", async () => {
		const owner = await createAuthContextWithActiveOrganization(
			"sources-cross-org-owner@example.com",
		);
		const otherOrganizationId = await createSecondOrganization();
		const otherConnectionId = await insertClickhouseConnectionForOrganization({
			organizationId: otherOrganizationId,
		});

		const res = await requestWithAuth("/v1/sources", {
			method: "POST",
			headers: owner.headers,
			body: buildLogSourcePayload(otherConnectionId),
		});

		expect(res.status).toBe(404);
	});

	it("lists only sources from the active organization", async () => {
		const owner = await createAuthContextWithClickhouseConnection(
			"sources-list-owner@example.com",
		);
		const otherOrganizationId = await createSecondOrganization();
		const otherConnectionId = await insertClickhouseConnectionForOrganization({
			organizationId: otherOrganizationId,
		});
		const ownerSource = await createSource({
			headers: owner.headers,
			connectionId: owner.connectionId,
			name: "owner-source",
		});
		await insertLogSourceForOrganization({
			organizationId: otherOrganizationId,
			connectionId: otherConnectionId,
			name: "other-source",
		});

		const res = await requestWithAuth("/v1/sources?page=1&page_size=20", {
			method: "GET",
			headers: owner.headers,
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			data: Array<{ id: string; name: string; organizationId: string }>;
		};
		expect(body.data).toHaveLength(1);
		expect(body.data[0]?.id).toBe(ownerSource.id);
		expect(body.data[0]?.name).toBe("owner-source");
		expect(body.data[0]?.organizationId).toBe(owner.organizationId);
	});

	it("gets source by id only for the active organization", async () => {
		const owner = await createAuthContextWithClickhouseConnection(
			"sources-get-owner@example.com",
		);
		const otherOrganizationId = await createSecondOrganization();
		const otherConnectionId = await insertClickhouseConnectionForOrganization({
			organizationId: otherOrganizationId,
		});
		const ownerSource = await createSource({
			headers: owner.headers,
			connectionId: owner.connectionId,
			name: "owner-get-source",
		});
		const otherSourceId = await insertLogSourceForOrganization({
			organizationId: otherOrganizationId,
			connectionId: otherConnectionId,
			name: "other-get-source",
		});

		const ownerRes = await requestWithAuth(`/v1/sources/${ownerSource.id}`, {
			method: "GET",
			headers: owner.headers,
		});
		expect(ownerRes.status).toBe(200);

		const crossOrgRes = await requestWithAuth(`/v1/sources/${otherSourceId}`, {
			method: "GET",
			headers: owner.headers,
		});
		expect(crossOrgRes.status).toBe(404);
	});

	it("updates name, connectionId, and partial log config", async () => {
		const ctx = await createAuthContextWithClickhouseConnection(
			"sources-patch-valid@example.com",
		);
		const nextConnectionId = await createIntegration({
			headers: ctx.headers,
			type: "clickhouse",
			name: "next-clickhouse",
		});
		const source = await createSource({
			headers: ctx.headers,
			connectionId: ctx.connectionId,
			name: "old-name",
		});

		const res = await requestWithAuth(`/v1/sources/${source.id}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				name: "new-name",
				connectionId: nextConnectionId,
				config: {
					severityField: "level",
				},
			},
		});

		expect(res.status).toBe(200);
		const row = await getSourceRow(source.id);
		expect(row?.name).toBe("new-name");
		expect(row?.connectionId).toBe(nextConnectionId);
		expect(row?.config).toEqual({
			database: null,
			table: null,
			defaultSelectQuery:
				"Timestamp, ServiceName as service, SeverityText as level, Body",
			defaultOrderByQuery: "Timestamp DESC",
			severityField: "level",
			resourceAttributesField: "ResourceAttributes",
			logAttributesField: "LogAttributes",
			timestampField: "Timestamp",
			serviceNameField: "ServiceName",
			bodyField: "Body",
			traceIdField: "TraceId",
			spanIdField: "SpanId",
			luceneImplicitColumnField: "Body",
			traceSourceId: null,
			metricSourceId: null,
		});
	});

	it("creates log source with explicit database and table config", async () => {
		const ctx = await createAuthContextWithClickhouseConnection(
			"sources-create-non-null-config@example.com",
		);
		const source = await createSource({
			headers: ctx.headers,
			connectionId: ctx.connectionId,
			name: "logs-explicit-target",
			config: {
				database: "observability",
				table: "logs",
				severityField: "SeverityText",
			},
		});

		const row = await getSourceRow(source.id);
		expect(row?.config).toMatchObject({
			database: "observability",
			table: "logs",
			severityField: "SeverityText",
		});
	});

	it("preserves explicit database and table when patch config is partial", async () => {
		const ctx = await createAuthContextWithClickhouseConnection(
			"sources-patch-non-null-config@example.com",
		);
		const source = await createSource({
			headers: ctx.headers,
			connectionId: ctx.connectionId,
			config: {
				database: "observability",
				table: "logs",
				severityField: "SeverityText",
			},
		});

		const res = await requestWithAuth(`/v1/sources/${source.id}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				config: {
					bodyField: "Message",
				},
			},
		});

		expect(res.status).toBe(200);
		const row = await getSourceRow(source.id);
		expect(row?.config).toMatchObject({
			database: "observability",
			table: "logs",
			bodyField: "Message",
			severityField: "SeverityText",
		});
	});

	it("preserves existing log config fields when patch config is partial", async () => {
		const ctx = await createAuthContextWithClickhouseConnection(
			"sources-patch-config-merge@example.com",
		);
		const source = await createSource({
			headers: ctx.headers,
			connectionId: ctx.connectionId,
		});

		const seedRes = await requestWithAuth(`/v1/sources/${source.id}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				config: {
					bodyField: "Message",
					serviceNameField: "Service",
					severityField: "Severity",
				},
			},
		});
		expect(seedRes.status).toBe(200);

		const res = await requestWithAuth(`/v1/sources/${source.id}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				config: {
					severityField: "Level",
				},
			},
		});

		expect(res.status).toBe(200);
		const row = await getSourceRow(source.id);
		expect(row?.config).toMatchObject({
			bodyField: "Message",
			serviceNameField: "Service",
			severityField: "Level",
		});
	});

	it("returns 400 when type is sent in update payload", async () => {
		const ctx = await createAuthContextWithClickhouseConnection(
			"sources-patch-type-rejected@example.com",
		);
		const source = await createSource({
			headers: ctx.headers,
			connectionId: ctx.connectionId,
		});

		const res = await requestWithAuth(`/v1/sources/${source.id}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				type: "log",
			},
		});

		expect(res.status).toBe(400);
	});

	it("returns 400 when update payload is empty", async () => {
		const ctx = await createAuthContextWithClickhouseConnection(
			"sources-patch-empty@example.com",
		);
		const source = await createSource({
			headers: ctx.headers,
			connectionId: ctx.connectionId,
		});

		const res = await requestWithAuth(`/v1/sources/${source.id}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {},
		});

		expect(res.status).toBe(400);
	});

	it("returns 422 when update payload has no changes", async () => {
		const ctx = await createAuthContextWithClickhouseConnection(
			"sources-patch-no-changes@example.com",
		);
		const source = await createSource({
			headers: ctx.headers,
			connectionId: ctx.connectionId,
			name: "same-name",
		});

		const res = await requestWithAuth(`/v1/sources/${source.id}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				name: "same-name",
			},
		});

		expect(res.status).toBe(422);
	});

	it("returns 400 when updating source to non-clickhouse connection", async () => {
		const ctx = await createAuthContextWithClickhouseConnection(
			"sources-patch-resend-rejected@example.com",
		);
		const source = await createSource({
			headers: ctx.headers,
			connectionId: ctx.connectionId,
		});
		const resendConnectionId = await createIntegration({
			headers: ctx.headers,
			type: "resend",
		});

		const res = await requestWithAuth(`/v1/sources/${source.id}`, {
			method: "PATCH",
			headers: ctx.headers,
			body: {
				connectionId: resendConnectionId,
			},
		});

		expect(res.status).toBe(400);
	});

	it("returns 404 when updating source to connection from another organization", async () => {
		const owner = await createAuthContextWithClickhouseConnection(
			"sources-patch-cross-org-owner@example.com",
		);
		const otherOrganizationId = await createSecondOrganization();
		const otherConnectionId = await insertClickhouseConnectionForOrganization({
			organizationId: otherOrganizationId,
		});
		const source = await createSource({
			headers: owner.headers,
			connectionId: owner.connectionId,
		});

		const res = await requestWithAuth(`/v1/sources/${source.id}`, {
			method: "PATCH",
			headers: owner.headers,
			body: {
				connectionId: otherConnectionId,
			},
		});

		expect(res.status).toBe(404);
	});

	it("deletes source from active organization", async () => {
		const ctx = await createAuthContextWithClickhouseConnection(
			"sources-delete-valid@example.com",
		);
		const source = await createSource({
			headers: ctx.headers,
			connectionId: ctx.connectionId,
		});

		const res = await requestWithAuth(`/v1/sources/${source.id}`, {
			method: "DELETE",
			headers: ctx.headers,
		});

		expect(res.status).toBe(204);
		expect(await getSourceRow(source.id)).toBeNull();
	});

	it("returns 404 when deleting source from another organization", async () => {
		const owner = await createAuthContextWithActiveOrganization(
			"sources-delete-cross-org-owner@example.com",
		);
		const otherOrganizationId = await createSecondOrganization();
		const otherConnectionId = await insertClickhouseConnectionForOrganization({
			organizationId: otherOrganizationId,
		});
		const otherSourceId = await insertLogSourceForOrganization({
			organizationId: otherOrganizationId,
			connectionId: otherConnectionId,
		});

		const res = await requestWithAuth(`/v1/sources/${otherSourceId}`, {
			method: "DELETE",
			headers: owner.headers,
		});

		expect(res.status).toBe(404);
		expect(await getSourceRow(otherSourceId)).not.toBeNull();
	});
});
