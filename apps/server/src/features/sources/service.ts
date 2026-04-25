import { BaseService } from "@/common/services/baseService";
import { checkForChanges } from "@/common/utils";
import { httpErrors } from "@/lib/errors";
import type { ConnectionRepository } from "../connections/repository";
import type { SourceRepository } from "./repository";
import type {
	SourcesType,
	SourcesUpsertInput,
	SourceUpdateInput,
} from "./schemas";

export class SourceService extends BaseService<SourcesType> {
	protected repository: SourceRepository;
	protected connectionRepository: ConnectionRepository;

	constructor(
		repository: SourceRepository,
		connectionRepository: ConnectionRepository,
	) {
		super(repository);
		this.repository = repository;
		this.connectionRepository = connectionRepository;
	}

	async createSource(input: SourcesUpsertInput, activeOrganizationId: string) {
		await this.ensureConnectionBelongsToOrganization(
			input.connectionId,
			activeOrganizationId,
		);

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

		if (input.connectionId !== undefined) {
			await this.ensureConnectionBelongsToOrganization(
				input.connectionId,
				activeOrganizationId,
			);
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

	private async ensureConnectionBelongsToOrganization(
		connectionId: string,
		activeOrganizationId: string,
	) {
		const connection = await this.connectionRepository.getById(connectionId, {
			organizationId: activeOrganizationId,
		});

		if (!connection) {
			throw httpErrors.notFound({
				detail: "The specified connection was not found",
			});
		}
	}
}
