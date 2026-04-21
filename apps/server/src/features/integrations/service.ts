import type { InferInsertModel } from "drizzle-orm";
import { checkForChanges } from "@/common/utils";
import { BaseService } from "@/common/services/baseService";
import type { PgIntegrationsType } from "@/db/models";
import { httpErrors } from "@/lib/errors";
import type { IntegrationRepository } from "./repository";
import type {
	IntegrationUpdateInput,
	IntegrationsType,
	IntegrationsUpsertInput,
} from "./schemas";

const UNIQUE_VIOLATION_CODE = "23505";
const SINGLE_DEFAULT_CONSTRAINT = "integrations_single_default_per_org_uidx";

export class IntegrationService extends BaseService<IntegrationsType> {
	protected repository: IntegrationRepository;

	constructor(repository: IntegrationRepository) {
		super(repository);
		this.repository = repository;
	}

	private isSingleDefaultConstraintError(error: unknown): boolean {
		if (!error || typeof error !== "object") return false;

		const dbError = error as {
			code?: string;
			errno?: string;
			sqlState?: string;
			sqlstate?: string;
			constraint?: string;
		};

		const pgCode =
			dbError.errno ?? dbError.sqlState ?? dbError.sqlstate ?? dbError.code;

		return (
			pgCode === UNIQUE_VIOLATION_CODE &&
			dbError.constraint === SINGLE_DEFAULT_CONSTRAINT
		);
	}

	private rethrowKnownDatabaseErrors(error: unknown): never {
		const rootCause =
			error && typeof error === "object"
				? (error as { cause?: unknown }).cause
				: undefined;

		if (
			this.isSingleDefaultConstraintError(error) ||
			this.isSingleDefaultConstraintError(rootCause)
		) {
			throw httpErrors.duplicateField("integration", "default", {
				detail: "Only one default integration is allowed per organization.",
			});
		}

		throw error;
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

	async createIntegration(
		input: IntegrationsUpsertInput,
		activeOrganizationId: string,
	) {
		const integrationData = {
			...input,
			organizationId: activeOrganizationId,
		};

		try {
			return input.isDefault === true
				? await this.createWithDefaultPromotion(integrationData)
				: await this.create(integrationData);
		} catch (error) {
			this.rethrowKnownDatabaseErrors(error);
		}
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

		if (!checkForChanges(existingIntegration, input)) {
			throw httpErrors.noChangesDetected();
		}

		const updatedIntegration = {
			...existingIntegration,
			...input,
		};

		try {
			return input.isDefault === true
				? await this.updateWithDefaultPromotion(
						id,
						updatedIntegration,
						activeOrganizationId,
					)
				: await this.update(id, updatedIntegration, {
						organizationId: activeOrganizationId,
					});
		} catch (error) {
			this.rethrowKnownDatabaseErrors(error);
		}
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
