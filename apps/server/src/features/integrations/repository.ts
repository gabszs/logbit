import { and, eq, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { BaseSqlRepository } from "@/common/repository/baseSqlRepository";
import type { dbType } from "@/db";
import type { PgIntegrationsType } from "@/db/models";
import { integrations } from "@/db/models/integrations";

export class IntegrationRepository extends BaseSqlRepository<PgIntegrationsType> {
	constructor(db: dbType) {
		super(integrations, db);
	}

	async createWithDefaultPromotion(
		data: InferInsertModel<PgIntegrationsType>,
	): Promise<InferSelectModel<PgIntegrationsType>> {
		return await this.db.transaction(async (tx) => {
			await tx
				.update(integrations)
				.set({ isDefault: false })
				.where(
					and(
						eq(integrations.organizationId, data.organizationId),
						eq(integrations.isDefault, true),
					),
				);

			const result = await tx
				.insert(integrations)
				.values({ ...data, isDefault: true })
				.returning();

			return result[0] as InferSelectModel<PgIntegrationsType>;
		});
	}

	async updateWithDefaultPromotion(
		id: string,
		data: Partial<InferInsertModel<PgIntegrationsType>>,
		organizationId: string,
	): Promise<InferSelectModel<PgIntegrationsType> | null> {
		return await this.db.transaction(async (tx) => {
			await tx
				.update(integrations)
				.set({ isDefault: false })
				.where(
					and(
						eq(integrations.organizationId, organizationId),
						eq(integrations.isDefault, true),
					),
				);

			const result = await tx
				.update(integrations)
				.set({ ...data, isDefault: true })
				.where(
					and(
						eq(integrations.id, id),
						eq(integrations.organizationId, organizationId),
					),
				)
				.returning();

			return (result[0] ?? null) as InferSelectModel<PgIntegrationsType> | null;
		});
	}
}
