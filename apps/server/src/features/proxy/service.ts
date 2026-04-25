import type { ConnectionRepository } from "@/features/connections/repository";
import { ClickhouseConfigSchema } from "@/integrations/clickhouse/schemas";
import { httpErrors } from "@/lib/errors";

export class ClickhouseProxyService {
	constructor(private readonly connectionRepository: ConnectionRepository) {}

	async resolveClickhouseConfig(
		connectionId: string,
		organizationId: string,
	) {
		const connection = await this.connectionRepository.getById(connectionId, {
			organizationId,
		});

		if (!connection) {
			throw httpErrors.notFound({ detail: "Connection not found" });
		}

		if (connection.type !== "clickhouse") {
			throw httpErrors.badRequest({
				detail: "Connection must be of type clickhouse",
			});
		}

		return ClickhouseConfigSchema.parse(connection.config);
	}
}
