import { createClient } from "@clickhouse/client";
import { BaseService } from "@/common/services/baseService";
import { checkForChanges } from "@/common/utils";
import { normalizeClickhouseConfig } from "@/integrations/clickhouse/config";
import { ClickhouseConfigSchema } from "@/integrations/clickhouse/schemas";
import { parseIntegrationConfig } from "@/integrations/registry";
import { httpErrors } from "@/lib/errors";
import type { ConnectionRepository } from "./repository";
import type {
	ClickhouseConnectionTestInput,
	ConnectionType,
	ConnectionUpdateInput,
	ConnectionUpsertInput,
} from "./schemas";

export class ConnectionService extends BaseService<ConnectionType> {
	protected repository: ConnectionRepository;

	constructor(repository: ConnectionRepository) {
		super(repository);
		this.repository = repository;
	}

	async createConnection(
		input: ConnectionUpsertInput,
		activeOrganizationId: string,
	) {
		if (input.type === "clickhouse") {
			return await this.create({
				...input,
				config: normalizeClickhouseConfig(input.config),
				organizationId: activeOrganizationId,
			});
		}

		return await this.create({
			...input,
			organizationId: activeOrganizationId,
		});
	}

	async updateConnection(
		id: string,
		input: ConnectionUpdateInput,
		activeOrganizationId: string,
	) {
		const existingConnection = await this.getById(id, {
			organizationId: activeOrganizationId,
		});

		if (!existingConnection) {
			throw httpErrors.notFound({
				detail: "The requested integration was not found",
			});
		}

		if (!checkForChanges(input, existingConnection)) {
			throw httpErrors.noChangesDetected();
		}

		const updateData = { ...input };
		if (input.config !== undefined) {
			try {
				switch (existingConnection.type) {
					case "clickhouse": {
						updateData.config = normalizeClickhouseConfig(
							ClickhouseConfigSchema.parse(input.config),
						);
						break;
					}
					case "resend":
						updateData.config = parseIntegrationConfig("resend", input.config);
						break;
					case "cloudflare":
						updateData.config = parseIntegrationConfig(
							"cloudflare",
							input.config,
						);
						break;
				}
			} catch {
				throw httpErrors.badRequest({
					detail: `Invalid config for connection type "${existingConnection.type}"`,
				});
			}
		}

		const updatedConnection = await this.update(id, updateData, {
			organizationId: activeOrganizationId,
		});

		if (!updatedConnection) {
			throw httpErrors.notFound({
				detail: "The requested integration was not found",
			});
		}

		return updatedConnection;
	}

	async deleteConnection(id: string, activeOrganizationId: string) {
		const existingConnection = await this.getById(id, {
			organizationId: activeOrganizationId,
		});

		if (!existingConnection) {
			throw httpErrors.notFound({
				detail: "The requested integration was not found",
			});
		}

		await this.delete(id, {
			organizationId: activeOrganizationId,
		});
	}

	async testClickhousePing(config: ClickhouseConnectionTestInput) {
		let client = null;
		try {
			client = createClient({
				host: config.host,
				username: config.username,
				...(config.database != null ? { database: config.database } : {}),
				...(config.password != null ? { password: config.password } : {}),
			});
			const result = await client.ping();
			return {
				success: result.success,
				error:
					result.success === true
						? null
						: result.error instanceof Error
							? result.error.message
							: "ClickHouse ping failed",
				data: null,
			};
		} catch (error) {
			throw httpErrors.badRequest({
				detail:
					error instanceof Error
						? error.message
						: "Failed to connect to ClickHouse with the provided configuration",
			});
		} finally {
			await client?.close();
		}
	}

	async testClickhouseQuery(config: ClickhouseConnectionTestInput) {
		let client = null;
		try {
			client = createClient({
				host: config.host,
				username: config.username,
				...(config.database != null ? { database: config.database } : {}),
				...(config.password != null ? { password: config.password } : {}),
			});
			const result = await client.query({
				query: "SELECT 1 AS ok",
				format: "JSONEachRow",
			});
			const rows = await result.json<Record<string, unknown>>();
			return {
				success: true,
				error: null,
				data: rows[0] ?? null,
			};
		} catch (error) {
			throw httpErrors.badRequest({
				detail:
					error instanceof Error
						? error.message
						: "Failed to query ClickHouse with the provided configuration",
			});
		} finally {
			await client?.close();
		}
	}
}
