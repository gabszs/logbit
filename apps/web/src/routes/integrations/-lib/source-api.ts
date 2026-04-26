import type { ConnectionListSuccessType } from "@/server/features/connections/schemas";
import type {
	SourcesListSuccessType,
	SourcesUpsertInput,
	SourceUpdateInput,
} from "@/server/features/sources/schemas";
import { honoClient, parseHonoResponse } from "@/web/lib/hono-rpc";

type SearchQuery = {
	page?: string;
	page_size?: string;
	ordering?: string;
};

type IntegrationsHonoClient = {
	v1: {
		connections: {
			$get: (args: { query: SearchQuery }) => Promise<Response>;
			":id": {
				$delete: (args: { param: { id: string } }) => Promise<Response>;
			};
		};
		sources: {
			$get: (args: { query: SearchQuery }) => Promise<Response>;
			$post: (args: { json: SourcesUpsertInput }) => Promise<Response>;
			":id": {
				$patch: (args: {
					param: { id: string };
					json: SourceUpdateInput;
				}) => Promise<Response>;
				$delete: (args: { param: { id: string } }) => Promise<Response>;
			};
		};
	};
};

const integrationsClient = honoClient as IntegrationsHonoClient;
const allowedConnections = ["clickhouse"] as const;

export type SourceEntity = SourcesListSuccessType["data"][number];
export type ConnectionOption = ConnectionListSuccessType["data"][number];

export async function getSources(page: number, pageSize: number) {
	const response = await integrationsClient.v1.sources.$get({
		query: {
			page: String(page),
			page_size: String(pageSize),
		},
	});
	const result = await parseHonoResponse<SourcesListSuccessType>(response);
	return result.data;
}

export async function getSourcesForSourceSelect() {
	const response = await integrationsClient.v1.sources.$get({
		query: {
			page: "1",
			page_size: "all",
			ordering: "name",
		},
	});
	const result = await parseHonoResponse<SourcesListSuccessType>(response);
	return result.data;
}

export async function getConnectionsForSourceSelect() {
	const response = await integrationsClient.v1.connections.$get({
		query: {
			page: "1",
			page_size: "all",
			ordering: "name",
		},
	});
	const result = await parseHonoResponse<ConnectionListSuccessType>(response);
	return result.data.filter((connection) =>
		allowedConnections.some((type) => type === connection.type),
	);
}

export async function createSource(payload: SourcesUpsertInput) {
	const response = await integrationsClient.v1.sources.$post({
		json: payload,
	});
	return await parseHonoResponse(response);
}

export async function updateSource(id: string, payload: SourceUpdateInput) {
	const response = await integrationsClient.v1.sources[":id"].$patch({
		param: { id },
		json: payload,
	});
	return await parseHonoResponse(response);
}

export async function deleteSource(id: string) {
	const response = await integrationsClient.v1.sources[":id"].$delete({
		param: { id },
	});
	return await parseHonoResponse(response);
}

export async function deleteConnection(id: string) {
	const response = await integrationsClient.v1.connections[":id"].$delete({
		param: { id },
	});
	return await parseHonoResponse(response);
}
