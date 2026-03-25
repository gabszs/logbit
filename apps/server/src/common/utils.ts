import { httpErrors } from "../lib/errors";
import type { AppContext } from "./types";

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
	throw httpErrors.noChangesDetected();
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
