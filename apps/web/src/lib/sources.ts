import type { ConnectionListSuccessType } from "@/server/features/connections/schemas";
import type { SourcesListSuccessType } from "@/server/features/sources/schemas";
import { honoClient, parseHonoResponse } from "@/web/lib/hono-rpc";

type SourceQuery = {
	page?: string;
	page_size?: string;
	ordering?: string;
};

export type SourceEntity = SourcesListSuccessType["data"][number];
export type LogSourceEntity = Extract<SourceEntity, { type: "log" }>;
export type ConnectionEntity = ConnectionListSuccessType["data"][number];

async function listSources(query: SourceQuery) {
	const response = await honoClient.v1.sources.$get({ query });
	const result = await parseHonoResponse<SourcesListSuccessType>(response);
	return result.data;
}

export async function getSources(page: number, pageSize: number) {
	return await listSources({
		page: String(page),
		page_size: String(pageSize),
	});
}

export async function getSourcesForSourceSelect() {
	return await listSources({
		page: "1",
		page_size: "all",
		ordering: "name",
	});
}

export async function getLogSources() {
	return (
		await listSources({
			page: "1",
			page_size: "all",
			ordering: "name",
		})
	).filter((source): source is LogSourceEntity => source.type === "log");
}
