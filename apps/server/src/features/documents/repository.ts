import { type DrizzleD1Database } from "drizzle-orm/d1";
import { BaseSqlRepository } from "../../common/repository/baseSqlRepository";
import { documents } from "../../db/documents";

export class DocumentRepository extends BaseSqlRepository<typeof documents> {
	constructor(db: DrizzleD1Database) {
		super(documents, db);
	}
}
