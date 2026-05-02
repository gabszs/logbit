import type { ConnectionListSuccessType } from "@/server/features/connections/schemas";
import type { SourcesListSuccessType } from "@/server/features/sources/schemas";
import { getResponseErrorMessage, honoClient } from "@/web/lib/hono-rpc";

type SourceQuery = {
	page?: number;
	page_size?: number | "all";
	ordering?: string;
};

export type SourceEntity = SourcesListSuccessType["data"][number];
export type LogSourceEntity = Extract<SourceEntity, { type: "log" }>;
export type ConnectionEntity = ConnectionListSuccessType["data"][number];

async function listSources(query: SourceQuery) {
	const response = await honoClient.v1.sources.$get({
		header: {},
		query,
	});
	if (response.status !== 200) {
		throw new Error(await getResponseErrorMessage(response));
	}

	return (await response.json()).data;
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
	).filter((source) => source.type === "log");
}
