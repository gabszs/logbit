import { BaseSqlRepository } from "@/common/repository/baseSqlRepository";
import type { dbType } from "@/db";
import type { PgConnectionsType } from "@/db/models";
import { connections } from "@/db/models/connections";

export class ConnectionRepository extends BaseSqlRepository<PgConnectionsType> {
		constructor(db: dbType) {
			super(connections, db);
		}
	}
