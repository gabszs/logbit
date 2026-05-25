import { describe, expect, it } from "bun:test";
import {
	applyDynamicFacetFilters,
	applyDynamicFacetWhereQuery,
	buildDynamicFacetWhereExpression,
	buildDynamicFacetSidecarQuery,
	buildFacetFieldsFromMetadata,
	buildFacetViewGroups,
	buildJsonKeysQuery,
	buildMetadataQuery,
	type DynamicFacetField,
	type DynamicFacetState,
	groupFacetFields,
	toggleDynamicFacetContainsValue,
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

const bodyField = {
	id: "column:Body",
	kind: "column",
	label: "Body",
	column: "Body",
	dataType: "String",
	filterMode: "contains",
} satisfies DynamicFacetField;

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

	it("puts SeverityText first when ClickHouse exposes it as a field", () => {
		const { fields: builtFields } = buildFacetFieldsFromMetadata(
			[
				{ name: "ServiceName", type: "LowCardinality(String)" },
				{ name: "TraceId", type: "String" },
				{ name: "SeverityText", type: "LowCardinality(String)" },
			],
			{},
		);

		expect(builtFields.map((field) => field.label)).toEqual([
			"SeverityText",
			"ServiceName",
			"TraceId",
		]);
	});

	it("marks Body as a contains-capable facet when ClickHouse exposes it", () => {
		const { fields: builtFields } = buildFacetFieldsFromMetadata(
			[
				{ name: "ServiceName", type: "LowCardinality(String)" },
				{ name: "Body", type: "String" },
			],
			{},
		);

		expect(
			builtFields.find((field) => field.label === "Body")?.filterMode,
		).toBe("contains");
		expect(
			builtFields.find((field) => field.label === "ServiceName")
				?.filterMode,
		).toBe("exact");
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

	it("moves Body custom contains terms between include and exclude sets", () => {
		const first = toggleDynamicFacetContainsValue(
			{},
			"column:Body",
			"caller",
			"include",
		);
		const second = toggleDynamicFacetContainsValue(
			first,
			"column:Body",
			"caller",
			"exclude",
		);

		expect(first).toEqual({
			"column:Body": {
				included: [],
				excluded: [],
				containsIncluded: ["caller"],
				containsExcluded: [],
			},
		});
		expect(second).toEqual({
			"column:Body": {
				included: [],
				excluded: [],
				containsIncluded: [],
				containsExcluded: ["caller"],
			},
		});
	});

	it("keeps Body custom terms when exact Body options are toggled off", () => {
		const state: DynamicFacetState = {
			"column:Body": {
				included: ["full body value"],
				excluded: [],
				containsIncluded: ["caller"],
				containsExcluded: [],
			},
		};

		expect(
			toggleDynamicFacetValue(
				state,
				"column:Body",
				"full body value",
				"include",
			),
		).toEqual({
			"column:Body": {
				included: [],
				excluded: [],
				containsIncluded: ["caller"],
				containsExcluded: [],
			},
		});
	});


	it("applies Body custom contains filters case-insensitively", () => {
		const rows = [
			{ Body: "Caller service failed" },
			{ Body: "caller noisy debug" },
			{ Body: "worker ok" },
		];
		const facetRows = [
			{ values: { "column:Body": ["Caller service failed"] } },
			{ values: { "column:Body": ["caller noisy debug"] } },
			{ values: { "column:Body": ["worker ok"] } },
		];
		const state: DynamicFacetState = {
			"column:Body": {
				included: [],
				excluded: [],
				containsIncluded: ["caller"],
				containsExcluded: ["debug"],
			},
		};

		expect(applyDynamicFacetFilters(rows, facetRows, state)).toEqual([rows[0]]);
	});

	it("keeps selected excluded options visible when their current count is zero", () => {
		const state: DynamicFacetState = {
			"column:ServiceName": { included: [], excluded: ["staging"] },
		};
		const groups = buildFacetViewGroups(
			[fields[0]],
			[{ values: { "column:ServiceName": ["api"] } }],
			state,
		);

		expect(groups[0]?.fields[0]?.options).toEqual([
			{ value: "api", count: 1, included: false, excluded: false },
			{ value: "staging", count: 0, included: false, excluded: true },
		]);
	});

	it("builds ClickHouse WHERE SQL for included and excluded facet values", () => {
		const state: DynamicFacetState = {
			"column:ServiceName": { included: ["api", "worker"], excluded: [] },
			"json:ResourceAttributes:service.name": {
				included: [],
				excluded: ["checkout"],
			},
		};

		expect(buildDynamicFacetWhereExpression(fields, state)).toBe(
			[
				"nullIf(toString(`ServiceName`), '') IN ('api', 'worker')",
				"AND",
				"(",
				"  nullIf(JSON_VALUE(toJSONString(`ResourceAttributes`), '$.\"service.name\"'), '') IS NULL",
				"  OR nullIf(JSON_VALUE(toJSONString(`ResourceAttributes`), '$.\"service.name\"'), '') NOT IN ('checkout')",
				")",
			].join("\n"),
		);
	});

	it("builds ClickHouse WHERE SQL for Body exact options and custom contains terms", () => {
		const state: DynamicFacetState = {
			"column:Body": {
				included: ["full body value"],
				excluded: [],
				containsIncluded: ["caller"],
				containsExcluded: ["debug"],
			},
		};

		expect(buildDynamicFacetWhereExpression([bodyField], state)).toBe(
			[
				"nullIf(toString(`Body`), '') IN ('full body value')",
				"AND",
				"multiSearchAnyCaseInsensitive(toString(`Body`), ['caller']) = 1",
				"AND",
				"multiSearchAnyCaseInsensitive(toString(`Body`), ['debug']) = 0",
			].join("\n"),
		);
	});

	it("keeps Body custom contains terms above exact Body options", () => {
		const state: DynamicFacetState = {
			"column:Body": {
				included: ["full body value"],
				excluded: [],
				containsIncluded: ["caller"],
				containsExcluded: [],
			},
		};

		const groups = buildFacetViewGroups(
			[bodyField],
			[
				{ values: { "column:Body": ["Caller service failed"] } },
				{ values: { "column:Body": ["full body value"] } },
			],
			state,
		);

		expect(groups[0]?.fields[0]?.customOptions).toEqual([
			{ value: "caller", count: 1, included: true, excluded: false },
		]);
		expect(groups[0]?.fields[0]?.options).toContainEqual({
			value: "full body value",
			count: 1,
			included: true,
			excluded: false,
		});
	});

	it("escapes facet values in generated ClickHouse WHERE SQL", () => {
		const state: DynamicFacetState = {
			"column:ServiceName": { included: ["api's\\edge"], excluded: [] },
		};

		expect(buildDynamicFacetWhereExpression(fields, state)).toBe(
			"nullIf(toString(`ServiceName`), '') IN ('api\\'s\\\\edge')",
		);
	});

	it("replaces managed facet SQL while preserving manual SQL", () => {
		const expression = buildDynamicFacetWhereExpression(fields, {
			"column:ServiceName": { included: ["api"], excluded: [] },
		});

		const first = applyDynamicFacetWhereQuery(
			"SeverityText = 'ERROR'",
			expression,
		);
		expect(first).toBe(
			[
				"SeverityText = 'ERROR'",
				"AND (nullIf(toString(`ServiceName`), '') IN ('api'))",
			].join("\n"),
		);

		const nextExpression = buildDynamicFacetWhereExpression(fields, {
			"column:ServiceName": { included: [], excluded: ["api"] },
		});
		const replaced = applyDynamicFacetWhereQuery(
			first,
			nextExpression,
			expression,
		);
		expect(replaced).toBe(
			[
				"SeverityText = 'ERROR'",
				"AND ((",
				"  nullIf(toString(`ServiceName`), '') IS NULL",
				"  OR nullIf(toString(`ServiceName`), '') NOT IN ('api')",
				"))",
			].join("\n"),
		);
	});

	it("removes managed facet SQL when no facets are active", () => {
		const expression = "nullIf(toString(`SeverityText`), '') IN ('ERROR')";
		const whereQuery = [
			"ServiceName = 'api'",
			"AND (",
			expression,
			")",
		].join("\n");

		expect(applyDynamicFacetWhereQuery(whereQuery, null, expression)).toBe(
			"ServiceName = 'api'",
		);
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
