import { BaseService } from "@/common/services/baseService";
import { checkForChanges } from "@/common/utils";
import { httpErrors } from "@/lib/errors";
import type { IntegrationRepository } from "./repository";
import type {
	IntegrationsType,
	IntegrationsUpsertInput,
	IntegrationUpdateInput,
} from "./schemas";

export class IntegrationService extends BaseService<IntegrationsType> {
	protected repository: IntegrationRepository;

	constructor(repository: IntegrationRepository) {
		super(repository);
		this.repository = repository;
	}

	async createIntegration(
		input: IntegrationsUpsertInput,
		activeOrganizationId: string,
	) {
		const integrationData = {
			...input,
			organizationId: activeOrganizationId,
		};

		return await this.create(integrationData);
	}

	async updateIntegration(
		id: string,
		input: IntegrationUpdateInput,
		activeOrganizationId: string,
	) {
		const existingIntegration = await this.getById(id, {
			organizationId: activeOrganizationId,
		});

		if (!existingIntegration) {
			throw httpErrors.notFound({
				detail: "The requested integration was not found",
			});
		}

		if (!checkForChanges(input, existingIntegration)) {
			throw httpErrors.noChangesDetected();
		}

		const updatedIntegration = await this.update(id, input, {
			organizationId: activeOrganizationId,
		});

		if (!updatedIntegration) {
			throw httpErrors.notFound({
				detail: "The requested integration was not found",
			});
		}

		return updatedIntegration;
	}

	async deleteIntegration(id: string, activeOrganizationId: string) {
		const existingIntegration = await this.getById(id, {
			organizationId: activeOrganizationId,
		});

		if (!existingIntegration) {
			throw httpErrors.notFound({
				detail: "The requested integration was not found",
			});
		}

		await this.delete(id, {
			organizationId: activeOrganizationId,
		});
	}
}
