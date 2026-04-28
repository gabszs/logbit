import type { ConnectionListSuccessType } from "@/server/features/connections/schemas";
import type {
	SourcesListSuccessType,
	SourcesUpsertInput,
	SourceUpdateInput,
} from "@/server/features/sources/schemas";

const serverUrl = import.meta.env.VITE_SERVER_URL;

if (!serverUrl) {
	throw new Error("VITE_SERVER_URL is not defined");
}

type SearchQuery = {
	page?: string;
	page_size?: string;
	ordering?: string;
};

async function request(path: string, init?: RequestInit) {
	return await fetch(`${serverUrl}${path}`, {
		...init,
		credentials: "include",
	});
}

function withJsonBody(body: unknown): RequestInit {
	return {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	};
}

function withPatchJsonBody(body: unknown): RequestInit {
	return {
		method: "PATCH",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	};
}

function withDelete(): RequestInit {
	return {
		method: "DELETE",
	};
}

function buildQueryString(query?: SearchQuery) {
	if (!query) return "";

	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value != null && value !== "") {
			params.set(key, value);
		}
	}
	return params.toString() ? `?${params.toString()}` : "";
}

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

type HonoClient = {
	setup: {
		$get: () => Promise<Response>;
	};
	v1: {
		connections: {
			$get: (args: { query?: SearchQuery }) => Promise<Response>;
			":id": {
				$delete: (args: { param: { id: string } }) => Promise<Response>;
			};
		};
		sources: {
			$get: (args: { query?: SearchQuery }) => Promise<Response>;
			$post: (args: { json: SourcesUpsertInput }) => Promise<Response>;
			":id": {
				$patch: (args: {
					param: { id: string };
					json: SourceUpdateInput;
				}) => Promise<Response>;
				$delete: (args: { param: { id: string } }) => Promise<Response>;
			};
		};
	};
};

export const honoClient: HonoClient = {
	setup: {
		$get: async () => await request("/setup"),
	},
	v1: {
		connections: {
			$get: async ({ query }) =>
				await request(`/v1/connections${buildQueryString(query)}`),
			":id": {
				$delete: async ({ param }) =>
					await request(`/v1/connections/${param.id}`, withDelete()),
			},
		},
		sources: {
			$get: async ({ query }) =>
				await request(`/v1/sources${buildQueryString(query)}`),
			$post: async ({ json }) =>
				await request("/v1/sources", withJsonBody(json)),
			":id": {
				$patch: async ({ param, json }) =>
					await request(`/v1/sources/${param.id}`, withPatchJsonBody(json)),
				$delete: async ({ param }) =>
					await request(`/v1/sources/${param.id}`, withDelete()),
			},
		},
	},
};

export interface SetupStatusResponse {
	hasUsers: boolean;
}

export async function getSetupStatus() {
	return await parseHonoResponse<SetupStatusResponse>(
		await honoClient.setup.$get(),
	);
}

export type ConnectionsListResponse = ConnectionListSuccessType;
export type SourcesListResponse = SourcesListSuccessType;
