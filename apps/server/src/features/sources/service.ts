import { BaseService } from "@/common/services/baseService";
import { checkForChanges } from "@/common/utils";
import type { LogsConfigType } from "@/features/sources/logs/schemas";
import { logsConfigSchema } from "@/features/sources/logs/schemas";
import type { TracesConfigType } from "@/features/sources/traces/schemas";
import { tracesConfigSchema } from "@/features/sources/traces/schemas";
import { httpErrors } from "@/lib/errors";
import type { ConnectionRepository } from "../connections/repository";
import type { SourceRepository } from "./repository";
import type {
	SourcesType,
	SourcesUpsertInput,
	SourceUpdateInput,
} from "./schemas";

const allowedConnections = ["clickhouse"] as const;

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

		if (input.connectionId !== undefined) {
			await this.ensureConnectionBelongsToOrganization(
				input.connectionId,
				activeOrganizationId,
			);
		}

		const { config, ...rest } = input;
		const updateData: Omit<SourceUpdateInput, "config"> & {
			config?: LogsConfigType | TracesConfigType;
		} = { ...rest };

		if (config !== undefined) {
			try {
				const nextConfig = {
					...existingSource.config,
					...config,
				};
				switch (existingSource.type) {
					case "log":
						updateData.config = logsConfigSchema.parse(nextConfig);
						break;
					case "trace":
						updateData.config = tracesConfigSchema.parse(nextConfig);
						break;
					default:
						throw new Error("Unsupported source type");
				}
			} catch {
				throw httpErrors.badRequest({
					detail: `Invalid config for source type "${existingSource.type}"`,
				});
			}
		}

		if (!checkForChanges(updateData, existingSource)) {
			throw httpErrors.noChangesDetected();
		}

		const updatedSource = await this.update(id, updateData, {
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

		if (!allowedConnections.some((type) => type === connection.type)) {
			throw httpErrors.badRequest({
				detail: `Sources can only use ${allowedConnections.join(", ")} connections`,
			});
		}
	}
}
