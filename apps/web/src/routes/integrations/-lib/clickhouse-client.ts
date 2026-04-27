import { createClient } from "@clickhouse/client-web";
import type {
	ClickhouseConnectionTestInput,
	ConnectionTestResultType,
} from "@/server/features/connections/schemas";
import { parseHonoResponse } from "@/web/lib/hono-rpc";

// Proxy client — @clickhouse/client-web usa apenas a origin da URL,
// descartando qualquer path. O fetch customizado reescreve cada request
// para incluir o path do proxy antes de enviá-la ao servidor.
export function createProxyClient(connectionId: string) {
	const serverUrl = import.meta.env.VITE_SERVER_URL as string;
	const proxyPrefix = `/v1/proxy/connections/${connectionId}`;

	return createClient({
		url: serverUrl,
		fetch: ((input, init) => {
			const url = new URL(input.toString());
			url.pathname = proxyPrefix + url.pathname;
			return fetch(url.toString(), { ...init, credentials: "include" });
		}) as typeof fetch,
	});
}

export type ClickhouseJsonResult<T = Record<string, unknown>> = {
	data: T[];
	meta?: Array<{
		name: string;
		type: string;
	}>;
	rows?: number;
	statistics?: {
		elapsed: number;
		rows_read: number;
		bytes_read: number;
	};
	query_id?: string;
	totals?: T;
	extremes?: Record<string, unknown>;
	rows_before_limit_at_least?: number;
};

export async function executeClickhouseJsonQuery<T = Record<string, unknown>>(
	client: ReturnType<typeof createProxyClient>,
	query: string,
): Promise<ClickhouseJsonResult<T>> {
	const result = await client.query({
		query,
		format: "JSON",
	});

	try {
		return await result.json<T>();
	} finally {
		await result.close();
	}
}

function looksLikeHtmlError(message: string) {
	const normalized = message.trim().toLowerCase();
	return (
		normalized.startsWith("<!doctype html>") ||
		normalized.startsWith("<html") ||
		normalized.includes("cloudflare") ||
		normalized.includes("bad gateway")
	);
}

export function formatClickhouseQueryError(error: unknown) {
	if (!(error instanceof Error)) {
		return "Failed to run the ClickHouse query";
	}

	const message = error.message.trim();
	if (looksLikeHtmlError(message)) {
		return "The ClickHouse host returned a bad gateway response. Check the source connection host, proxy reachability, and TLS/Cloudflare configuration.";
	}

	return message || "Failed to run the ClickHouse query";
}

const serverUrl = import.meta.env.VITE_SERVER_URL as string;

async function requestConnections(path: string, init?: RequestInit) {
	return await fetch(`${serverUrl}/v1${path}`, {
		...init,
		credentials: "include",
	});
}

const connectionsClient = {
	connections: {
		ping: {
			$post: async ({ json }: { json: ClickhouseConnectionTestInput }) =>
				await requestConnections("/connections/ping", {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify(json),
				}),
		},
		"query-test": {
			$post: async ({ json }: { json: ClickhouseConnectionTestInput }) =>
				await requestConnections("/connections/query-test", {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify(json),
				}),
		},
	},
};

async function postClickhouseConnectionTest(
	path: "/ping" | "/query-test",
	config: ClickhouseConnectionTestInput,
) {
	const response =
		path === "/ping"
			? await connectionsClient.connections.ping.$post({
					json: config,
				})
			: await connectionsClient.connections["query-test"].$post({
					json: config,
				});

	return await parseHonoResponse<ConnectionTestResultType>(response);
}

export async function pingClickhouseConnection(
	config: ClickhouseConnectionTestInput,
) {
	return await postClickhouseConnectionTest("/ping", config);
}

export async function queryTestClickhouseConnection(
	config: ClickhouseConnectionTestInput,
) {
	return await postClickhouseConnectionTest("/query-test", config);
}

// Manual client — aponta direto para o ClickHouse com X-ClickHouse-User/Key.
export function createManualClient(
	host: string,
	username: string,
	password: string,
) {
	return createClient({
		url: host,
		username: username || "default",
		...(password ? { password } : {}),
	});
}

export async function pingClient(
	client: ReturnType<typeof createClient>,
	timeoutMs = 5_000,
): Promise<boolean> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	try {
		const timeout = new Promise<false>((resolve) => {
			timeoutId = setTimeout(() => resolve(false), timeoutMs);
		});
		const ping = client
			.ping()
			.then(({ success }) => success)
			.catch(() => false);

		return await Promise.race([ping, timeout]);
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
}
