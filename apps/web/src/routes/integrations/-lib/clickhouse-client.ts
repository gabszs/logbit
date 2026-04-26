import { createClient } from "@clickhouse/client-web";
import { hc } from "hono/client";
import type connectionsRouter from "@/server/features/connections/routes";
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

const connectionsClient = hc<typeof connectionsRouter>(
	`${import.meta.env.VITE_SERVER_URL}/v1`,
	{
		init: {
			credentials: "include",
		},
	},
);

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
