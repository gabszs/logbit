import type { InferInsertModel } from "drizzle-orm";
import { BaseService } from "@/common/services/baseService";
import type { PgIntegrationsType } from "@/db/models";
import type { IntegrationRepository } from "./repository";
import type { IntegrationsType } from "./schemas";

export class IntegrationService extends BaseService<IntegrationsType> {
	protected repository: IntegrationRepository;

	constructor(repository: IntegrationRepository) {
		super(repository);
		this.repository = repository;
	}

	async createWithDefaultPromotion(data: InferInsertModel<PgIntegrationsType>) {
		return await this.repository.createWithDefaultPromotion(data);
	}

	async updateWithDefaultPromotion(
		id: string,
		data: Partial<InferInsertModel<PgIntegrationsType>>,
		organizationId: string,
	) {
		return await this.repository.updateWithDefaultPromotion(
			id,
			data,
			organizationId,
		);
	}
}
