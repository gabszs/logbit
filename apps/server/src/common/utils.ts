import { httpErrors } from "../lib/errors";
import { type AppContext } from "./types";

type RouteData = {
	params: any;
	query: any;
	body: any;
	headers: any;
};

export function getValidatedRouteData(c: AppContext): RouteData {
	return {
		params: c.req.valid("param"),
		query: c.req.valid("query"),
		body: c.req.valid("json"),
		headers: c.req.valid("header"),
	};
}

export async function debugContext(c: AppContext) {
	console.log("--- DEBUG Hono Context ---");

	// Método e URL
	console.log("Method:", c.req.method);
	console.log("URL:", c.req.url);

	// Headers (safe and iterable)
	console.log("Headers:", Object.fromEntries(c.req.raw.headers));

	// Query params
	try {
		console.log("Query params:", c.req.query());
	} catch {
		console.log("Query params: <not available>");
	}

	// Params da rota
	try {
		console.log("Path params:", c.req.param());
	} catch {
		console.log("Path params: <not available>");
	}

	// Safe Body (clone)
	try {
		const clone = c.req.raw.clone();
		const text = await clone.text();

		try {
			console.log("Body JSON:", JSON.parse(text));
		} catch {
			console.log("Body Text:", text);
		}
	} catch (err) {
		console.log("Body read error:", err);
	}

	// Env / Bindings (safe)
	console.log("Env bindings:", c.env ?? "<no env>");

	console.log("--- END DEBUG ---");
}

export function checkForChanges(
	c: AppContext,
	payload: Record<string, any>,
	existing: Record<string, any>,
) {
	for (const key of Object.keys(payload)) {
		if (payload[key] !== existing[key]) {
			return;
		}
	}
	throw httpErrors.noChangesDetected(c);
}

export const toArray = (val: unknown) => {
	if (val === undefined || val === null || val === "") return undefined;
	if (Array.isArray(val)) return val;
	if (typeof val === "string") {
		// If it contains a comma, split. Otherwise return as array of 1 element
		return val.includes(",") ? val.split(",").map((v) => v.trim()) : [val];
	}
	return undefined;
};

/**
 * Hashes a string using SHA-256 and returns the hex digest
 * Used for hashing PII data (email, phone) before sending to CAPI platforms
 */
export async function sha256Hash(text: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(text.toLowerCase().trim());
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Removes all null and undefined values from an object recursively
 * Used to clean payloads before sending to CAPI platforms
 */
export function removeNullFields<T>(obj: T): T {
	if (obj === null || obj === undefined) {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => removeNullFields(item)) as T;
	}

	if (typeof obj === "object") {
		const cleaned: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			if (value !== null && value !== undefined) {
				cleaned[key] = removeNullFields(value);
			}
		}
		return cleaned as T;
	}

	return obj;
}

/**
 * Converts SQL datetime to Unix timestamp in milliseconds
 * Handles both ISO format and SQL format (YYYY-MM-DD HH:MM:SS)
 */
export function convertToUnixTimestamp(sqlDatetime: string): number {
	const datetimeWithZ = sqlDatetime.includes("T")
		? sqlDatetime
		: `${sqlDatetime.replace(" ", "T")}Z`;
	return new Date(datetimeWithZ).getTime();
}
