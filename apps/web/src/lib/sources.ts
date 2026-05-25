import type { ConnectionEntityType } from "@/server/features/connections/schemas";
import type { SourcesListSuccessType } from "@/server/features/sources/schemas";
import { getResponseErrorMessage, honoClient } from "@/web/lib/hono-rpc";
import { SourceType } from "@/web/lib/source-types";

export { SourceType };

type SourceQuery = {
	page?: number;
	page_size?: number | "all";
	ordering?: string;
};

export type SourceEntity = SourcesListSuccessType["data"][number];
export type LogSourceEntity = Extract<SourceEntity, { type: "log" }>;
export type TraceSourceEntity = Extract<SourceEntity, { type: "trace" }>;
export type ConnectionEntity = ConnectionEntityType;

type SourceWireEntity = Omit<SourceEntity, "createdAt" | "updatedAt"> & {
	createdAt: string;
	updatedAt: string;
};

type ConnectionWireEntity = Omit<
	ConnectionEntity,
	"createdAt" | "updatedAt"
> & {
	createdAt: string;
	updatedAt: string;
};

function hydrateDates<T extends { createdAt: string; updatedAt: string }>(
	entity: T,
): Omit<T, "createdAt" | "updatedAt"> & {
	createdAt: Date;
	updatedAt: Date;
} {
	return {
		...entity,
		createdAt: new Date(entity.createdAt),
		updatedAt: new Date(entity.updatedAt),
	};
}

function hydrateSource(source: SourceWireEntity): SourceEntity {
	return hydrateDates(source) as SourceEntity;
}

function hydrateConnection(connection: ConnectionWireEntity): ConnectionEntity {
	return hydrateDates(connection) as ConnectionEntity;
}

export function isLogSource(source: SourceEntity): source is LogSourceEntity {
	return source.type === SourceType.Log;
}

export function isTraceSource(
	source: SourceEntity,
): source is TraceSourceEntity {
	return source.type === SourceType.Trace;
}

async function listSources(query: SourceQuery) {
	const response = await honoClient.v1.sources.$get({
		header: {},
		query,
	});
	if (response.status !== 200) {
		throw new Error(await getResponseErrorMessage(response));
	}

	const result = (await response.json()) as { data: SourceWireEntity[] };
	return result.data.map(hydrateSource);
}

export async function listConnections(query: SourceQuery) {
	const response = await honoClient.v1.connections.$get({
		header: {},
		query,
	});
	if (response.status !== 200) {
		throw new Error(await getResponseErrorMessage(response));
	}

	const result = (await response.json()) as { data: ConnectionWireEntity[] };
	return result.data.map(hydrateConnection);
}

export async function getSources(page: number, pageSize: number) {
	return await listSources({
		page,
		page_size: pageSize,
	});
}

export async function getSourcesForSourceSelect() {
	return await listSources({
		page: 1,
		page_size: "all",
		ordering: "name",
	});
}

export async function getLogSources() {
	return (
		await listSources({
			page: 1,
			page_size: "all",
			ordering: "name",
		})
	).filter(isLogSource);
}
