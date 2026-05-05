import type { DataRow } from "./types";

export function isDataRecord(value: unknown): value is DataRow {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function safeStringify(value: unknown, space = 2) {
	try {
		const serialized = JSON.stringify(value, null, space);
		return serialized ?? String(value);
	} catch {
		return String(value);
	}
}

export function formatPrimitiveValue(value: unknown) {
	if (value == null) return "null";
	if (typeof value === "string") return value === "" ? '""' : value;
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		return String(value);
	}
	if (value instanceof Date) return value.toISOString();
	return safeStringify(value);
}

export function toDisplayText(value: unknown) {
	if (value == null) return "—";
	if (typeof value === "string") return value === "" ? '""' : value;
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		return String(value);
	}
	if (value instanceof Date) return value.toISOString();
	return safeStringify(value);
}

export function tryParseJsonString(value: unknown): unknown {
	if (typeof value !== "string") return value;

	const trimmed = value.trim();
	if (
		!(
			(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
			(trimmed.startsWith("[") && trimmed.endsWith("]"))
		)
	) {
		return value;
	}

	try {
		const parsed: unknown = JSON.parse(trimmed);
		return parsed;
	} catch {
		return value;
	}
}

export function getValueEntries(value: unknown): Array<[string, unknown]> {
	const inspectable = tryParseJsonString(value);
	if (Array.isArray(inspectable)) {
		return inspectable.map((item, index) => [String(index), item]);
	}

	if (isDataRecord(inspectable)) {
		return Object.entries(inspectable);
	}

	return [];
}

export function hasNestedEntries(value: unknown) {
	return getValueEntries(value).length > 0;
}
