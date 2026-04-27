import type { ConnectionListSuccessType } from "@/server/features/connections/schemas";
import type {
	SourcesUpsertInput,
	SourceUpdateInput,
} from "@/server/features/sources/schemas";
import { honoClient, parseHonoResponse } from "@/web/lib/hono-rpc";
import {
	type ConnectionEntity,
	getSources,
	getSourcesForSourceSelect,
	type SourceEntity as SharedSourceEntity,
} from "@/web/lib/sources";
export type ConnectionOption = ConnectionEntity;
export type SourceEntity = SharedSourceEntity;

export { getSources, getSourcesForSourceSelect };

export async function getConnectionsForSourceSelect() {
	const response = await honoClient.v1.connections.$get({
		query: {
			page: "1",
			page_size: "all",
			ordering: "name",
		},
	});
	const result = await parseHonoResponse<ConnectionListSuccessType>(response);
	return result.data.filter((connection) => connection.type === "clickhouse");
}

export async function createSource(payload: SourcesUpsertInput) {
	const response = await honoClient.v1.sources.$post({
		json: payload,
	});
	return await parseHonoResponse(response);
}

export async function updateSource(id: string, payload: SourceUpdateInput) {
	const response = await honoClient.v1.sources[":id"].$patch({
		param: { id },
		json: payload,
	});
	return await parseHonoResponse(response);
}

export async function deleteSource(id: string) {
	const response = await honoClient.v1.sources[":id"].$delete({
		param: { id },
	});
	return await parseHonoResponse(response);
}

export async function deleteConnection(id: string) {
	const response = await honoClient.v1.connections[":id"].$delete({
		param: { id },
	});
	return await parseHonoResponse(response);
}
