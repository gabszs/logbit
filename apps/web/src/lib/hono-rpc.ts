import { hc } from "hono/client";
import type { AppType } from "@/server/client/contracts";

const serverUrl = import.meta.env.VITE_SERVER_URL;

if (!serverUrl) {
	throw new Error("VITE_SERVER_URL is not defined");
}

export const honoClient = hc<AppType>(serverUrl, {
	init: {
		credentials: "include",
	},
});

export class HonoRpcError extends Error {
	status: number;
	data: unknown;

	constructor(status: number, message: string, data: unknown) {
		super(message);
		this.name = "HonoRpcError";
		this.status = status;
		this.data = data;
	}
}

export async function parseHonoResponse<T>(response: Response): Promise<T> {
	const contentType = response.headers.get("content-type") ?? "";
	const data =
		contentType.includes("application/json") ||
		contentType.includes("application/problem+json")
			? await response.json()
			: await response.text();

	if (!response.ok) {
		const message =
			typeof data === "object" &&
			data !== null &&
			"detail" in data &&
			typeof data.detail === "string"
				? data.detail
				: typeof data === "object" &&
						data !== null &&
						"message" in data &&
						typeof data.message === "string"
					? data.message
					: `Request failed with status ${response.status}`;

		throw new HonoRpcError(response.status, message, data);
	}

	return data as T;
}

export interface SetupStatusResponse {
	hasUsers: boolean;
}

type SetupClient = {
	setup: {
		$get: () => Promise<Response>;
	};
};

export async function getSetupStatus() {
	return await parseHonoResponse<SetupStatusResponse>(
		await (honoClient as SetupClient).setup.$get(),
	);
}
