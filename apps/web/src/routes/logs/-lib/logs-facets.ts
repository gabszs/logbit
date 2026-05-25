import {
	escapeSqlString,
	type LogsQueryAbsoluteTimeRange,
	type LogTimeRange,
	quoteIdentifier,
} from "./logs-queries";

type FacetSourceConfig = {
	config: {
		database?: string | null;
		table?: string | null;
		timestampQueryField?: string | null;
	};
};

export type DynamicFacetMode = "include" | "exclude";

export type DynamicFacetField =
	| {
			id: string;
			kind: "column";
			label: string;
			column: string;
			dataType: string;
	  }
	| {
			id: string;
			kind: "json";
			label: string;
			column: string;
			path: string;
			dataType: string;
	  };

export type DynamicFacetGroup = {
	id: string;
	label: string;
	fields: DynamicFacetField[];
};

export type DynamicFacetSelection = {
	included: string[];
	excluded: string[];
};

export type DynamicFacetState = Record<string, DynamicFacetSelection>;

export type DynamicFacetRow = {
	values: Record<string, string[]>;
};

export type DynamicFacetOption = {
	value: string;
	count: number;
	included: boolean;
	excluded: boolean;
};

export type DynamicFacetViewField = DynamicFacetField & {
	options: DynamicFacetOption[];
	total: number;
};

export type DynamicFacetViewGroup = {
	id: string;
	label: string;
	fields: DynamicFacetViewField[];
};

export type DynamicFacetQueryState = {
	whereQuery?: string;
	orderByQuery?: string;
	timeRange: LogTimeRange;
	now?: Date;
	absoluteTimeRange?: LogsQueryAbsoluteTimeRange;
	additionalWhereClauses?: string[];
};

export type ClickhouseColumnMeta = {
	name: string;
	type: string;
};

export type DynamicFacetBuildResult = {
	fields: DynamicFacetField[];
	jsonKeyColumns: Array<{ jsonColumn: string; keyColumn: string }>;
	jsonColumnsWithoutKeyColumns: string[];
};

const FIELD_OPTION_LIMIT = 200;
const FACET_ALIAS_PREFIX = "__facet_";

function sourceTableName(source: FacetSourceConfig) {
	return `${quoteIdentifier(source.config.database ?? "")}.${quoteIdentifier(source.config.table ?? "")}`;
}

function normalizeSqlExpression(value: string | null | undefined) {
	const trimmed = value?.trim() ?? "";
	if (!trimmed) return "";
	return trimmed.replaceAll(/;+\s*$/gu, "");
}

function buildTimeBounds(range: LogTimeRange, now = new Date()) {
	const msByRange: Record<LogTimeRange, number> = {
		"5m": 5 * 60 * 1000,
		"10m": 10 * 60 * 1000,
		"15m": 15 * 60 * 1000,
		"30m": 30 * 60 * 1000,
		"1h": 60 * 60 * 1000,
		"6h": 6 * 60 * 60 * 1000,
		"12h": 12 * 60 * 60 * 1000,
		"1d": 24 * 60 * 60 * 1000,
	};
	const end = now;
	const start = new Date(end.getTime() - msByRange[range]);
	return {
		start: start.toISOString(),
		end: end.toISOString(),
	};
}

function resolveTimeBounds(state: DynamicFacetQueryState) {
	if (state.absoluteTimeRange) {
		return {
			start: state.absoluteTimeRange.startIso,
			end: state.absoluteTimeRange.endIso,
		};
	}
	return buildTimeBounds(state.timeRange, state.now);
}

function buildWhereClauses(
	source: FacetSourceConfig,
	state: DynamicFacetQueryState,
) {
	const timestamp =
		normalizeSqlExpression(source.config.timestampQueryField) || "Timestamp";
	const { start, end } = resolveTimeBounds(state);
	const clauses = [
		`${timestamp} >= parseDateTimeBestEffortOrNull('${start}')`,
		`${timestamp} < parseDateTimeBestEffortOrNull('${end}')`,
	];
	const whereQuery = normalizeSqlExpression(state.whereQuery);
	if (whereQuery) {
		clauses.push(`(${whereQuery})`);
	}
	for (const clause of state.additionalWhereClauses ?? []) {
		const normalized = normalizeSqlExpression(clause);
		if (normalized) {
			clauses.push(`(${normalized})`);
		}
	}
	return clauses;
}

function jsonPathLiteral(path: string) {
	return `'$."${escapeSqlString(path).replaceAll('"', '\\"')}"'`;
}

export function facetAlias(index: number) {
	return `${FACET_ALIAS_PREFIX}${index}`;
}

export function fieldValueExpression(field: DynamicFacetField) {
	if (field.kind === "column") {
		return `toString(${quoteIdentifier(field.column)})`;
	}
	return `JSON_VALUE(toJSONString(${quoteIdentifier(field.column)}), ${jsonPathLiteral(field.path)})`;
}

export function groupFacetFields(fields: DynamicFacetField[]) {
	const groups = new Map<string, DynamicFacetGroup>();
	for (const field of fields) {
		const groupId = field.kind === "json" ? `json:${field.column}` : field.id;
		const groupLabel = field.kind === "json" ? field.column : field.label;
		const current = groups.get(groupId) ?? {
			id: groupId,
			label: groupLabel,
			fields: [],
		};
		current.fields.push(field);
		groups.set(groupId, current);
	}
	return Array.from(groups.values());
}

function emptySelection(): DynamicFacetSelection {
	return { included: [], excluded: [] };
}

function withoutValue(values: string[], value: string) {
	return values.filter((item) => item !== value);
}

export function toggleDynamicFacetValue(
	state: DynamicFacetState,
	fieldId: string,
	value: string,
	mode: DynamicFacetMode,
): DynamicFacetState {
	const current = state[fieldId] ?? emptySelection();
	const targetKey = mode === "include" ? "included" : "excluded";
	const otherKey = mode === "include" ? "excluded" : "included";
	const targetValues = current[targetKey].includes(value)
		? withoutValue(current[targetKey], value)
		: [...current[targetKey], value];
	const nextSelection = {
		...current,
		[targetKey]: targetValues,
		[otherKey]: withoutValue(current[otherKey], value),
	};
	const nextState = { ...state };
	if (
		nextSelection.included.length === 0 &&
		nextSelection.excluded.length === 0
	) {
		delete nextState[fieldId];
		return nextState;
	}
	nextState[fieldId] = nextSelection;
	return nextState;
}

export function hasDynamicFacetState(state: DynamicFacetState) {
	return Object.values(state).some(
		(selection) =>
			selection.included.length > 0 || selection.excluded.length > 0,
	);
}

function rowMatchesSelection(
	facetRow: DynamicFacetRow | undefined,
	fieldId: string,
	selection: DynamicFacetSelection,
) {
	const values = facetRow?.values[fieldId] ?? [];
	if (selection.included.length > 0) {
		const included = new Set(selection.included);
		if (!values.some((value) => included.has(value))) {
			return false;
		}
	}
	if (selection.excluded.length > 0) {
		const excluded = new Set(selection.excluded);
		if (values.some((value) => excluded.has(value))) {
			return false;
		}
	}
	return true;
}

export function applyDynamicFacetFilters<T>(
	rows: T[],
	facetRows: DynamicFacetRow[],
	state: DynamicFacetState,
) {
	if (!hasDynamicFacetState(state)) return rows;
	const entries = Object.entries(state);
	return rows.filter((_row, index) =>
		entries.every(([fieldId, selection]) =>
			rowMatchesSelection(facetRows[index], fieldId, selection),
		),
	);
}

function isStringColumnType(type: string) {
	const lowerType = type.toLowerCase();
	return lowerType.includes("string") && !lowerType.startsWith("array(");
}

function isJsonColumnType(type: string) {
	return type.toLowerCase().startsWith("json");
}

function isKeysColumn(type: string) {
	const lowerType = type.toLowerCase();
	return lowerType.startsWith("array(") && lowerType.includes("string");
}

function sortFields(a: DynamicFacetField, b: DynamicFacetField) {
	if (a.kind !== b.kind) return a.kind === "column" ? -1 : 1;
	if (a.column !== b.column) return a.column.localeCompare(b.column);
	return a.label.localeCompare(b.label);
}

export function buildFacetFieldsFromMetadata(
	columns: ClickhouseColumnMeta[],
	jsonKeys: Record<string, string[]>,
): DynamicFacetBuildResult {
	const keyColumnNames = new Set(
		columns
			.filter(
				(column) => isKeysColumn(column.type) && column.name.endsWith("Keys"),
			)
			.map((column) => column.name),
	);
	const jsonKeyColumns: Array<{ jsonColumn: string; keyColumn: string }> = [];
	const jsonColumnsWithoutKeyColumns: string[] = [];
	const fields: DynamicFacetField[] = [];

	for (const column of columns) {
		if (isStringColumnType(column.type)) {
			fields.push({
				id: `column:${column.name}`,
				kind: "column",
				label: column.name,
				column: column.name,
				dataType: column.type,
			});
			continue;
		}
		if (!isJsonColumnType(column.type)) continue;
		const keyColumn = `${column.name}Keys`;
		if (keyColumnNames.has(keyColumn)) {
			jsonKeyColumns.push({ jsonColumn: column.name, keyColumn });
		} else {
			jsonColumnsWithoutKeyColumns.push(column.name);
		}
		for (const path of jsonKeys[column.name] ?? []) {
			fields.push({
				id: `json:${column.name}:${path}`,
				kind: "json",
				label: path,
				column: column.name,
				path,
				dataType: "String",
			});
		}
	}

	return {
		fields: fields.sort(sortFields),
		jsonKeyColumns,
		jsonColumnsWithoutKeyColumns,
	};
}

export function buildMetadataQuery(source: FacetSourceConfig) {
	return `DESCRIBE TABLE ${sourceTableName(source)}`;
}

export function buildJsonKeysQuery(
	source: FacetSourceConfig,
	keyColumn: string,
	state: DynamicFacetQueryState,
) {
	const clauses = buildWhereClauses(source, state);
	return [
		`SELECT arrayDistinct(arrayFlatten(groupArray(${quoteIdentifier(keyColumn)}))) AS keys`,
		`FROM ${sourceTableName(source)}`,
		`WHERE ${clauses.join(" AND ")}`,
	].join("\n");
}

export function buildDistinctJsonPathsQuery(
	source: FacetSourceConfig,
	jsonColumn: string,
	state: DynamicFacetQueryState,
) {
	const clauses = buildWhereClauses(source, state);
	return [
		`SELECT distinctJSONPaths(${quoteIdentifier(jsonColumn)}) AS keys`,
		`FROM ${sourceTableName(source)}`,
		`WHERE ${clauses.join(" AND ")}`,
	].join("\n");
}

export function buildDynamicFacetValueQuery(
	source: FacetSourceConfig,
	field: DynamicFacetField,
	state: DynamicFacetQueryState,
) {
	const clauses = buildWhereClauses(source, state);
	const expression = fieldValueExpression(field);
	return [
		`WITH nullIf(${expression}, '') AS value`,
		"SELECT value, count() AS count",
		`FROM ${sourceTableName(source)}`,
		`WHERE ${clauses.join(" AND ")} AND value IS NOT NULL`,
		"GROUP BY value",
		"ORDER BY count DESC, value ASC",
		`LIMIT ${FIELD_OPTION_LIMIT}`,
	].join("\n");
}

export function buildDynamicFacetSidecarQuery(
	source: FacetSourceConfig,
	fields: DynamicFacetField[],
	state: DynamicFacetQueryState,
) {
	if (fields.length === 0) return null;
	const clauses = buildWhereClauses(source, state);
	const orderBy =
		normalizeSqlExpression(state.orderByQuery) || "Timestamp DESC";
	const selects = fields.map(
		(field, index) =>
			`${fieldValueExpression(field)} AS ${quoteIdentifier(facetAlias(index))}`,
	);
	return [
		`SELECT ${selects.join(", ")}`,
		`FROM ${sourceTableName(source)}`,
		`WHERE ${clauses.join(" AND ")}`,
		`ORDER BY ${orderBy}`,
		"LIMIT 500",
	].join("\n");
}

function normalizeFacetValue(value: unknown): string[] {
	if (value == null) return [];
	if (Array.isArray(value)) {
		return value.flatMap(normalizeFacetValue);
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? [trimmed] : [];
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return [String(value)];
	}
	return [];
}

export function normalizeFacetRows(
	rows: Array<Record<string, unknown>>,
	fields: DynamicFacetField[],
): DynamicFacetRow[] {
	return rows.map((row) => {
		const values: Record<string, string[]> = {};
		fields.forEach((field, index) => {
			values[field.id] = normalizeFacetValue(row[facetAlias(index)]);
		});
		return { values };
	});
}

export function buildFacetViewGroups(
	fields: DynamicFacetField[],
	facetRows: DynamicFacetRow[],
	state: DynamicFacetState,
) {
	const groups = groupFacetFields(fields);
	const viewGroups: DynamicFacetViewGroup[] = groups.map((group) => ({
		...group,
		fields: group.fields.map((field) => {
			const counts = new Map<string, number>();
			for (const facetRow of facetRows) {
				for (const value of facetRow.values[field.id] ?? []) {
					counts.set(value, (counts.get(value) ?? 0) + 1);
				}
			}
			const selection = state[field.id] ?? emptySelection();
			for (const value of [...selection.included, ...selection.excluded]) {
				if (!counts.has(value)) {
					counts.set(value, 0);
				}
			}
			const included = new Set(selection.included);
			const excluded = new Set(selection.excluded);
			const options = Array.from(counts.entries())
				.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
				.map(([value, count]) => ({
					value,
					count,
					included: included.has(value),
					excluded: excluded.has(value),
				}));

			return {
				...field,
				options,
				total: options.reduce((sum, option) => sum + option.count, 0),
			};
		}),
	}));

	return viewGroups.filter((group) =>
		group.fields.some((field) => field.options.length > 0),
	);
}
