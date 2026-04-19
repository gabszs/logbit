import { BaseSqlRepository } from "@/common/repository/baseSqlRepository";
import type { dbType } from "@/db";
import type { PgIntegrationsType } from "@/db/models";
import { integrations } from "@/db/models/integrations";

export class IntegrationsRepository extends BaseSqlRepository<PgIntegrationsType> {
	constructor(db: dbType) {
		super(integrations, db);
	}
}
