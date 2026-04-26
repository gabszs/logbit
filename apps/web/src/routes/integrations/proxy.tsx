import { createClient } from "@clickhouse/client-web";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	CheckCircle2,
	Database,
	Loader2,
	Play,
	Terminal,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import type {
	ConnectionEntityType,
	ConnectionListSuccessType,
} from "@/server/features/connections/schemas";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { Input } from "@/web/components/ui/input";
import { Label } from "@/web/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/web/components/ui/select";
import { Separator } from "@/web/components/ui/separator";
import { Textarea } from "@/web/components/ui/textarea";
import { parseHonoResponse } from "@/web/lib/hono-rpc";
import { cn } from "@/web/utils/cn";
import { IntegrationsError } from "./-components/integrations-error";
import { IntegrationsSectionSkeleton } from "./-components/integrations-section-skeleton";

type ClickhouseColumn = { name: string; type: string };

// ResponseJSON from @clickhouse/client-web returns optional meta/rows/statistics
type ClickhouseResult = {
	meta?: ClickhouseColumn[];
	data: Record<string, unknown>[];
	rows?: number;
	statistics?: { elapsed: number; rows_read: number; bytes_read: number };
};

type Mode = "saved" | "manual";

// ─── data fetching ───────────────────────────────────────────────────────────

async function fetchConnections(): Promise<ConnectionEntityType[]> {
	const url = new URL(`${import.meta.env.VITE_SERVER_URL}/v1/connections`);
	url.searchParams.set("page_size", "100");
	const response = await fetch(url.toString(), { credentials: "include" });
	const result = await parseHonoResponse<ConnectionListSuccessType>(response);
	return result.data;
}

function connectionsQueryOptions() {
	return queryOptions({
		queryKey: ["connections", "list", 1],
		queryFn: fetchConnections,
	});
}

// Proxy client — o @clickhouse/client-web usa apenas a origin da URL,
// descartando qualquer path. O fetch customizado reescreve cada request
// para incluir o path do proxy antes de enviá-la ao servidor.
function createProxyClient(connectionId: string) {
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

// Manual client — aponta direto para o ClickHouse com X-ClickHouse-User/Key.
function createManualClient(host: string, username: string, password: string) {
	return createClient({
		url: host,
		username: username || "default",
		...(password ? { password } : {}),
	});
}

async function executeQuery(
	client: ReturnType<typeof createClient>,
	sql: string,
): Promise<ClickhouseResult> {
	const rs = await client.query({ query: sql, format: "JSON" });
	// json<T> returns ResponseJSON<T> — data: T[], meta?: ..., rows?: ..., statistics?: ...
	return rs.json<Record<string, unknown>>() as Promise<ClickhouseResult>;
}

async function pingClient(
	client: ReturnType<typeof createClient>,
): Promise<boolean> {
	try {
		const { success } = await client.ping();
		return success;
	} catch {
		return false;
	}
}

// ─── preset queries ───────────────────────────────────────────────────────────

const PRESET_QUERIES: Array<{
	label: string;
	query: (db: string, table: string) => string;
}> = [
	{ label: "Databases", query: () => "SHOW DATABASES" },
	{
		label: "Tables",
		query: (db) =>
			db
				? `SHOW TABLES FROM ${db}`
				: "SELECT database, name, engine FROM system.tables WHERE database = 'default' ORDER BY database, name LIMIT 200",
	},
	{
		label: "Describe table",
		query: (db, table) =>
			`DESCRIBE TABLE ${db || "system"}.${table || "numbers"}`,
	},
	{
		label: "Server info",
		query: () =>
			"SELECT version() AS version, uptime() AS uptime_seconds, timezone() AS timezone, currentDatabase() AS current_database",
	},
	{
		label: "Active processes",
		query: () =>
			"SELECT query_id, user, elapsed, read_rows, memory_usage, query FROM system.processes WHERE is_cancelled = 0",
	},
	{
		label: "Stress test (50k)",
		query: () =>
			"SELECT number, toString(number) AS str, number * 2 AS doubled FROM system.numbers LIMIT 50000",
	},
];

// ─── route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/integrations/proxy")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(connectionsQueryOptions());
	},
	component: ProxyTestPage,
	pendingComponent: IntegrationsSectionSkeleton,
	errorComponent: IntegrationsError,
});

// ─── page ─────────────────────────────────────────────────────────────────────

function ProxyTestPage() {
	const { data: allConnections = [] } = useQuery(connectionsQueryOptions());
	const connections = allConnections.filter((c) => c.type === "clickhouse");

	const [mode, setMode] = useState<Mode>("saved");

	// saved mode
	const [connectionId, setConnectionId] = useState("");

	// manual mode
	const [host, setHost] = useState("http://localhost:8123");
	const [username, setUsername] = useState("default");
	const [password, setPassword] = useState("");

	// shared
	const [pingStatus, setPingStatus] = useState<
		"idle" | "pinging" | "ok" | "fail"
	>("idle");
	const [db, setDb] = useState("");
	const [table, setTable] = useState("");
	const [query, setQuery] = useState("SHOW DATABASES");
	const [isRunning, setIsRunning] = useState(false);
	const [result, setResult] = useState<ClickhouseResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	const canRun =
		mode === "saved" ? !!connectionId : !!host && !!username;

	const handleModeChange = (next: Mode) => {
		setMode(next);
		setPingStatus("idle");
		setResult(null);
		setError(null);
	};

	const handlePing = async () => {
		setPingStatus("pinging");
		const client =
			mode === "saved"
				? createProxyClient(connectionId)
				: createManualClient(host, username, password);
		const ok = await pingClient(client);
		setPingStatus(ok ? "ok" : "fail");
	};

	const handleRun = async () => {
		if (!canRun || !query.trim()) return;
		setIsRunning(true);
		setError(null);
		setResult(null);
		try {
			const client =
				mode === "saved"
					? createProxyClient(connectionId)
					: createManualClient(host, username, password);
			const data = await executeQuery(client, query);
			setResult(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setIsRunning(false);
		}
	};

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader className="gap-3">
					<div className="flex items-center gap-2">
						<Database className="size-5" />
						<CardTitle>ClickHouse Proxy Test</CardTitle>
					</div>
					<CardDescription>
						Run queries through the server proxy. Pick a saved connection or
						enter credentials manually.
					</CardDescription>
				</CardHeader>

				<Separator />

				<CardContent className="space-y-6 pt-6">
					{/* Mode toggle */}
					<div className="flex w-fit items-center gap-1 rounded-lg border border-border/70 bg-muted/40 p-1">
						{(["saved", "manual"] as Mode[]).map((m) => (
							<button
								key={m}
								type="button"
								onClick={() => handleModeChange(m)}
								className={cn(
									"rounded-md px-4 py-1.5 font-medium text-sm transition-colors",
									mode === m
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{m === "saved" ? "Saved connection" : "Manual"}
							</button>
						))}
					</div>

					{/* Connection config */}
					{mode === "saved" ? (
						<div className="space-y-2">
							<Label>Connection</Label>
							{connections.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									No ClickHouse connections found. Add one in the Connections
									tab.
								</p>
							) : (
								<div className="flex items-center gap-2">
									<Select
										value={connectionId}
										onValueChange={(v) => {
											setConnectionId(v);
											setPingStatus("idle");
										}}
									>
										<SelectTrigger className="w-full max-w-sm">
											<SelectValue placeholder="Select a connection" />
										</SelectTrigger>
										<SelectContent>
											{connections.map((c) => (
												<SelectItem key={c.id} value={c.id}>
													{c.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<PingButton
										disabled={!connectionId}
										status={pingStatus}
										onPing={handlePing}
									/>
								</div>
							)}
						</div>
					) : (
						<div className="space-y-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label>Host</Label>
									<Input
										placeholder="http://localhost:8123"
										value={host}
										onChange={(e) => setHost(e.target.value)}
										className="font-mono text-sm"
									/>
								</div>
								<div className="space-y-1.5">
									<Label>Username</Label>
									<Input
										placeholder="default"
										value={username}
										onChange={(e) => setUsername(e.target.value)}
									/>
								</div>
								<div className="space-y-1.5">
									<Label>
										Password{" "}
										<span className="font-normal text-muted-foreground text-xs">
											(optional)
										</span>
									</Label>
									<Input
										type="password"
										placeholder="––"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
									/>
								</div>
							</div>
							<PingButton
								disabled={!host || !username}
								status={pingStatus}
								onPing={handlePing}
							/>
						</div>
					)}

					<Separator />

					{/* Quick queries */}
					<div className="space-y-3">
						<div className="flex flex-wrap items-end gap-3">
							<div className="space-y-1.5">
								<Label className="text-xs text-muted-foreground">Database</Label>
								<Input
									className="h-8 w-32 text-xs"
									placeholder="default"
									value={db}
									onChange={(e) => setDb(e.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<Label className="text-xs text-muted-foreground">Table</Label>
								<Input
									className="h-8 w-36 text-xs"
									placeholder="table_name"
									value={table}
									onChange={(e) => setTable(e.target.value)}
								/>
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							{PRESET_QUERIES.map((preset) => (
								<Button
									key={preset.label}
									type="button"
									size="sm"
									variant="outline"
									className="h-7 px-2.5 text-xs"
									onClick={() => setQuery(preset.query(db, table))}
								>
									{preset.label}
								</Button>
							))}
						</div>
					</div>

					<Separator />

					{/* Query editor */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label>SQL</Label>
							<Button
								type="button"
								size="sm"
								onClick={handleRun}
								disabled={!canRun || !query.trim() || isRunning}
								className="h-7 gap-1.5 px-3 text-xs"
							>
								{isRunning ? (
									<Loader2 className="size-3 animate-spin" />
								) : (
									<Play className="size-3" />
								)}
								{isRunning ? "Running…" : "Run"}
							</Button>
						</div>
						<Textarea
							className="min-h-[120px] font-mono text-sm"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
									e.preventDefault();
									handleRun();
								}
							}}
							placeholder="SHOW DATABASES"
							spellCheck={false}
						/>
						<p className="text-muted-foreground text-xs">
							Ctrl+Enter to run
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Results */}
			{(result || error) && (
				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Terminal className="size-4" />
								<CardTitle className="text-base">Results</CardTitle>
							</div>
							{result && (
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="outline" className="text-xs">
										{(result.rows ?? result.data.length).toLocaleString()} rows
									</Badge>
									{result.statistics && (
										<>
											<Badge variant="outline" className="text-xs">
												{(result.statistics.elapsed * 1000).toFixed(1)}ms
											</Badge>
											<Badge variant="outline" className="text-xs">
												{formatBytes(result.statistics.bytes_read)} read
											</Badge>
										</>
									)}
								</div>
							)}
						</div>
					</CardHeader>

					<Separator />

					<CardContent className="pt-4">
						{error ? (
							<div className="rounded-lg bg-destructive/10 p-4">
								<p className="font-mono text-destructive text-xs whitespace-pre-wrap break-all">
									{error}
								</p>
							</div>
						) : result && (result.meta?.length ?? 0) > 0 ? (
							<div className="overflow-auto rounded-lg border border-border/70">
								<table className="w-full min-w-max text-sm">
									<thead>
										<tr className="border-border/70 border-b bg-muted/50">
											{(result.meta ?? []).map((col) => (
												<th
													key={col.name}
													className="px-3 py-2 text-left font-medium whitespace-nowrap"
												>
													<div className="flex flex-col gap-0.5">
														<span>{col.name}</span>
														<span className="font-normal text-muted-foreground text-xs">
															{col.type}
														</span>
													</div>
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{result.data.map((row, i) => (
											<tr
												// biome-ignore lint/suspicious/noArrayIndexKey: result rows have no stable id
												key={i}
												className="border-border/70 border-b last:border-0 hover:bg-muted/30"
											>
												{(result.meta ?? []).map((col) => (
													<td
														key={col.name}
														className="max-w-[320px] truncate px-3 py-2 font-mono text-xs"
														title={String(row[col.name] ?? "")}
													>
														{String(row[col.name] ?? "")}
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : null}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function PingButton({
	disabled,
	status,
	onPing,
}: {
	disabled: boolean;
	status: "idle" | "pinging" | "ok" | "fail";
	onPing: () => void;
}) {
	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			className="h-9 gap-1.5 px-3 text-xs"
			disabled={disabled || status === "pinging"}
			onClick={onPing}
		>
			{status === "pinging" ? (
				<Loader2 className="size-3 animate-spin" />
			) : status === "ok" ? (
				<CheckCircle2 className="size-3 text-green-500" />
			) : status === "fail" ? (
				<XCircle className="size-3 text-destructive" />
			) : null}
			Ping
		</Button>
	);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
}
