import { describe, expect, it } from "bun:test";
import {
	applyDynamicFacetFilters,
	buildDynamicFacetSidecarQuery,
	buildJsonKeysQuery,
	buildMetadataQuery,
	type DynamicFacetField,
	type DynamicFacetState,
	groupFacetFields,
	toggleDynamicFacetValue,
} from "./logs-facets";
import type { LogTimeRange } from "./logs-queries";

const fields = [
	{
		id: "column:ServiceName",
		kind: "column",
		label: "ServiceName",
		column: "ServiceName",
		dataType: "LowCardinality(String)",
	},
	{
		id: "json:ResourceAttributes:service.name",
		kind: "json",
		label: "service.name",
		column: "ResourceAttributes",
		path: "service.name",
		dataType: "String",
	},
	{
		id: "json:ResourceAttributes:k8s.pod.name",
		kind: "json",
		label: "k8s.pod.name",
		column: "ResourceAttributes",
		path: "k8s.pod.name",
		dataType: "String",
	},
] satisfies DynamicFacetField[];

describe("logs facets", () => {
	it("groups top-level fields and JSON paths without changing exact names", () => {
		expect(groupFacetFields(fields)).toEqual([
			{
				id: "column:ServiceName",
				label: "ServiceName",
				fields: [fields[0]],
			},
			{
				id: "json:ResourceAttributes",
				label: "ResourceAttributes",
				fields: [fields[1], fields[2]],
			},
		]);
	});

	it("applies include OR within a field, exclude NOT IN, and AND across fields", () => {
		const rows = [
			{ Body: "api ok" },
			{ Body: "worker ok" },
			{ Body: "api noisy" },
		];
		const state: DynamicFacetState = {
			"column:ServiceName": { included: ["api"], excluded: [] },
			"json:ResourceAttributes:deployment.environment.name": {
				included: [],
				excluded: ["staging"],
			},
		};
		const facetRows = [
			{
				values: {
					"column:ServiceName": ["api"],
					"json:ResourceAttributes:deployment.environment.name": ["prod"],
				},
			},
			{
				values: {
					"column:ServiceName": ["worker"],
					"json:ResourceAttributes:deployment.environment.name": ["prod"],
				},
			},
			{
				values: {
					"column:ServiceName": ["api"],
					"json:ResourceAttributes:deployment.environment.name": ["staging"],
				},
			},
		];

		expect(applyDynamicFacetFilters(rows, facetRows, state)).toEqual([rows[0]]);
	});

	it("moves a value between include and exclude sets", () => {
		const first = toggleDynamicFacetValue(
			{},
			"column:ServiceName",
			"api",
			"include",
		);
		const second = toggleDynamicFacetValue(
			first,
			"column:ServiceName",
			"api",
			"exclude",
		);

		expect(first).toEqual({
			"column:ServiceName": { included: ["api"], excluded: [] },
		});
		expect(second).toEqual({
			"column:ServiceName": { included: [], excluded: ["api"] },
		});
	});

	it("builds metadata, JSON key, and sidecar SQL without changing main SQL", () => {
		const source = {
			config: {
				database: "default",
				table: "otel_logs",
				timestampQueryField: "Timestamp",
			},
		};
		const queryState = {
			whereQuery: "ServiceName = 'api'",
			orderByQuery: "Timestamp DESC",
			timeRange: "15m" as LogTimeRange,
			now: new Date("2026-05-24T12:00:00.000Z"),
		};

		expect(buildMetadataQuery(source)).toBe(
			"DESCRIBE TABLE `default`.`otel_logs`",
		);
		expect(
			buildJsonKeysQuery(source, "ResourceAttributesKeys", queryState),
		).toContain(
			"arrayDistinct(arrayFlatten(groupArray(`ResourceAttributesKeys`)))",
		);

		const sidecar = buildDynamicFacetSidecarQuery(source, fields, queryState);
		expect(sidecar).toContain("toString(`ServiceName`) AS `__facet_0`");
		expect(sidecar).toContain(
			"JSON_VALUE(toJSONString(`ResourceAttributes`), '$.\"service.name\"') AS `__facet_1`",
		);
		expect(sidecar).toContain("ORDER BY Timestamp DESC");
	});
});
