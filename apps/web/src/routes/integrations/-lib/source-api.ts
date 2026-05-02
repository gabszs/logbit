import type {
	SourcesUpsertInput,
	SourceUpdateInput,
} from "@/server/features/sources/schemas";
import { getResponseErrorMessage, honoClient } from "@/web/lib/hono-rpc";
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
		header: {},
		query: {
			page: 1,
			page_size: "all",
			ordering: "name",
		},
	});
	if (!response.ok) {
		throw new Error(await getResponseErrorMessage(response));
	}

	const result = await response.json();
	return result.data.filter((connection) => connection.type === "clickhouse");
}

export async function createSource(payload: SourcesUpsertInput) {
	const response = await honoClient.v1.sources.$post({
		header: {},
		json: payload,
	});
	if (!response.ok) {
		throw new Error(await getResponseErrorMessage(response));
	}
}

export async function updateSource(id: string, payload: SourceUpdateInput) {
	const response = await honoClient.v1.sources[":id"].$patch({
		header: {},
		param: { id },
		json: payload,
	});
	if (!response.ok) {
		throw new Error(await getResponseErrorMessage(response));
	}
}

export async function deleteSource(id: string) {
	const response = await honoClient.v1.sources[":id"].$delete({
		header: {},
		param: { id },
	});
	if (!response.ok) {
		throw new Error(await getResponseErrorMessage(response));
	}
}

export async function deleteConnection(id: string) {
	const response = await honoClient.v1.connections[":id"].$delete({
		header: {},
		param: { id },
	});
	if (!response.ok) {
		throw new Error(await getResponseErrorMessage(response));
	}
}
