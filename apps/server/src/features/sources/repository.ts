import { BaseSqlRepository } from "@/common/repository/baseSqlRepository";
import type { dbType } from "@/db";
import type { PgSourcesType } from "@/db/models";
import { sources } from "@/db/models/sources";

export class SourceRepository extends BaseSqlRepository<PgSourcesType> {
	constructor(db: dbType) {
		super(sources, db);
	}
}
