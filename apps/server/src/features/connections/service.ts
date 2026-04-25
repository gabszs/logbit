import { BaseService } from "@/common/services/baseService";
import { checkForChanges } from "@/common/utils";
import { parseIntegrationConfig } from "@/integrations/registry";
import { httpErrors } from "@/lib/errors";
import type { ConnectionRepository } from "./repository";
import type {
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
		const integrationData = {
			...input,
			organizationId: activeOrganizationId,
		};

		return await this.create(integrationData);
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
				updateData.config = parseIntegrationConfig(
					existingConnection.type,
					input.config,
				);
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
}
