import { BaseService } from "@/common/services/baseService";
import { checkForChanges } from "@/common/utils";
import { httpErrors } from "@/lib/errors";
import type { SourceRepository } from "./repository";
import type {
	SourcesType,
	SourcesUpsertInput,
	SourceUpdateInput,
} from "./schemas";

export class SourceService extends BaseService<SourcesType> {
	protected repository: SourceRepository;

	constructor(repository: SourceRepository) {
		super(repository);
		this.repository = repository;
	}

	async createSource(input: SourcesUpsertInput, activeOrganizationId: string) {
		const sourceData = {
			...input,
			organizationId: activeOrganizationId,
		};

		return await this.create(sourceData);
	}

	async updateSource(
		id: string,
		input: SourceUpdateInput,
		activeOrganizationId: string,
	) {
		const existingSource = await this.getById(id, {
			organizationId: activeOrganizationId,
		});

		if (!existingSource) {
			throw httpErrors.notFound({
				detail: "The requested source was not found",
			});
		}

		if (!checkForChanges(input, existingSource)) {
			throw httpErrors.noChangesDetected();
		}

		const updatedSource = await this.update(id, input, {
			organizationId: activeOrganizationId,
		});

		if (!updatedSource) {
			throw httpErrors.notFound({
				detail: "The requested source was not found",
			});
		}

		return updatedSource;
	}

	async deleteSource(id: string, activeOrganizationId: string) {
		const existingSource = await this.getById(id, {
			organizationId: activeOrganizationId,
		});

		if (!existingSource) {
			throw httpErrors.notFound({
				detail: "The requested source was not found",
			});
		}

		await this.delete(id, {
			organizationId: activeOrganizationId,
		});
	}
}
