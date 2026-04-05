import type { AppContext } from "@/types";
import { httpErrors } from "../lib/errors";

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
