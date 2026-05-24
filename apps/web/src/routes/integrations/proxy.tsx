import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	CheckCircle2,
	Database,
	Loader2,
	Play,
	Terminal,
	XCircle,
	Zap,
} from "lucide-react";
import { useState } from "react";
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
import { listConnections } from "@/web/lib/sources";
import { cn } from "@/web/utils/cn";
import {
	createManualClient,
	createProxyClient,
	pingClient,
} from "../../lib/clickhouse-client";
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

async function fetchConnections() {
	return await listConnections({
		page: 1,
		page_size: "all",
		ordering: "name",
	});
}

function connectionsQueryOptions() {
	return queryOptions({
		queryKey: ["connections", "list", "all"],
		queryFn: fetchConnections,
	});
}

async function executeQuery(
	client: ReturnType<typeof createProxyClient>,
	sql: string,
): Promise<ClickhouseResult> {
	const rs = await client.query({ query: sql, format: "JSON" });
	// json<T> returns ResponseJSON<T> — data: T[], meta?: ..., rows?: ..., statistics?: ...
	return rs.json<Record<string, unknown>>() as Promise<ClickhouseResult>;
}

// ─── stack test scenarios ─────────────────────────────────────────────────────
// Cada cenário cria erros com call stacks reais e profundos para testar o
// pipeline de coleta → parse → envio ao collector.

function scenarioCauseChain() {
	// 3 níveis de error.cause — innermost primeiro no exception.values
	function tcpConnect(host: string) {
		const err = new Error(`ECONNREFUSED ${host}:5432 (connection refused)`);
		err.name = "ConnectionError";
		return err;
	}
	function runDatabaseQuery(sql: string) {
		const conn = tcpConnect("prod-db-01.cluster.internal");
		const err = new Error(`Query failed after 3 retries: "${sql.slice(0, 60)}"`, {
			cause: conn,
		});
		err.name = "QueryError";
		return err;
	}
	function loadUserProfile(userId: string) {
		const query = runDatabaseQuery(
			`SELECT profile, preferences, metadata FROM users WHERE id = '${userId}' LIMIT 1`,
		);
		return new TypeError(
			"Cannot read properties of undefined (reading 'profile')",
			{ cause: query },
		);
	}
	Promise.reject(loadUserProfile("usr_01J9XKZM3PQRS7VW6TNHB4D2C"));
}

function scenarioDeepStack() {
	// Stack sync de 6 frames reais — testa o V8 line parser
	function assertDefined(value: unknown, field: string): asserts value is NonNullable<unknown> {
		if (value == null) {
			throw new TypeError(
				`Null assertion failed at field "${field}" — schema validation aborted`,
			);
		}
	}
	function extractCell(row: Record<string, unknown>, col: string) {
		assertDefined(row[col], col);
		return row[col];
	}
	function processRow(row: Record<string, unknown>, schema: string[]) {
		return schema.map((col) => extractCell(row, col));
	}
	function validateDataFrame(frame: unknown[]) {
		return processRow(frame[0] as Record<string, unknown>, [
			"id",
			"timestamp",
			"value",
			"meta",
			"source",
		]);
	}
	function deserializeClickhouseResponse(raw: unknown) {
		return validateDataFrame(raw as unknown[]);
	}
	try {
		deserializeClickhouseResponse([{ id: 1, timestamp: null, value: null }]);
	} catch (err) {
		window.dispatchEvent(
			new ErrorEvent("error", {
				error: err instanceof Error ? err : new Error(String(err)),
			}),
		);
	}
}

function scenarioAsyncChain() {
	// Async chain — cada await adiciona um frame; rejeição vira unhandledrejection
	async function decodeJwtPayload(token: string) {
		const parts = token.split(".");
		if (parts.length !== 3) {
			throw new SyntaxError(
				`Malformed JWT: expected 3 segments, got ${parts.length} — token="${token.slice(0, 24)}..."`,
			);
		}
		const payload = JSON.parse(atob(parts[1] ?? "")) as {
			exp?: number;
			sub?: string;
		};
		if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
			const err = new Error(
				`Token expired: exp=${payload.exp ?? "missing"}, now=${Math.floor(Date.now() / 1000)} (delta=${Math.floor(Date.now() / 1000) - (payload.exp ?? 0)}s)`,
			);
			err.name = "JwtExpiredError";
			throw err;
		}
		return payload;
	}
	async function validateSessionClaims(token: string) {
		const payload = await decodeJwtPayload(token);
		if (!payload.sub) {
			throw new Error("JWT missing required claim: sub");
		}
		return payload;
	}
	async function refreshAccessToken(refreshToken: string) {
		await validateSessionClaims(refreshToken);
		throw new Error("Auth server rejected token rotation (HTTP 401 Unauthorized)");
	}
	async function bootstrapAuthState() {
		await refreshAccessToken(
			"eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE2MDAwMDAwMDB9.invalid-sig",
		);
	}
	void bootstrapAuthState();
}

function scenarioResourceError() {
	// Injeta um <img> com src inválido — capturado pelo listener document capture
	const img = document.createElement("img");
	img.src = `https://cdn.otel-test.loglog.dev/missing-asset-${Date.now()}.png`;
	img.style.cssText =
		"position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px";
	document.body.appendChild(img);
	const cleanup = () => img.remove();
	img.addEventListener("error", cleanup, { once: true });
	img.addEventListener("load", cleanup, { once: true });
}

function scenarioConsoleError() {
	// SyntaxError em deserialização — requer VITE_OTEL_CONSOLE_ERROR_ENABLED=true
	function parseJsonBody(raw: string) {
		function attemptParse(input: string) {
			return JSON.parse(input);
		}
		try {
			return attemptParse(raw);
		} catch {
			const err = new SyntaxError(
				`Unexpected token '<' at position 0 while parsing response body: "${raw.slice(0, 40)}..."`,
			);
			console.error("[api] Response deserialization failed:", err);
		}
	}
	parseJsonBody("<!DOCTYPE html><html><body>503 Service Unavailable</body></html>");
}

function scenarioAuthChain() {
	// 3-level auth cause chain — testa walkCauseChain + mechanism por nível
	function decodeBase64Segment(segment: string) {
		if (!/^[A-Za-z0-9+/=_-]+$/.test(segment)) {
			const err = new SyntaxError(
				`Invalid base64url in JWT segment: "${segment.slice(0, 20)}" — unexpected character`,
			);
			err.name = "TokenDecodeError";
			return err;
		}
		return null;
	}
	function validateSessionToken(sessionId: string) {
		const decodeErr = decodeBase64Segment("INVALID_B@SE64_SEG!MENT_CORRUPT==");
		const err = new Error(
			`Session ${sessionId}: access token is corrupt or tampered — cannot decode payload`,
			{ cause: decodeErr ?? undefined },
		);
		err.name = "SessionValidationError";
		return err;
	}
	function authorizeApiRequest(method: string, path: string) {
		const sessionErr = validateSessionToken("sess_01JA2RNTQ8PVX3YW7KMHB5D4E");
		const err = new Error(
			`Authorization denied for ${method} ${path}: identity cannot be verified`,
			{ cause: sessionErr },
		);
		err.name = "AuthorizationError";
		return err;
	}
	Promise.reject(authorizeApiRequest("POST", "/orpc/settings.update"));
}

type StackTestScenario = {
	id: string;
	name: string;
	source: string;
	description: string;
	fire: () => void;
};

const STACK_TEST_SCENARIOS: StackTestScenario[] = [
	{
		id: "cause-chain",
		name: "Cause chain 3 níveis",
		source: "unhandled-rejection",
		description:
			"TypeError → QueryError → ConnectionError — testa walkCauseChain e exception.values com 3 entradas",
		fire: scenarioCauseChain,
	},
	{
		id: "deep-stack",
		name: "Stack sync 6 frames",
		source: "window-error",
		description:
			"assertDefined → extractCell → processRow → validateFrame → deserialize — testa o V8 line parser",
		fire: scenarioDeepStack,
	},
	{
		id: "async-chain",
		name: "Async rejection chain",
		source: "unhandled-rejection",
		description:
			"bootstrapAuth → refreshToken → validateClaims → decodeJwt — frames async encadeados",
		fire: scenarioAsyncChain,
	},
	{
		id: "resource-error",
		name: "Resource load failure",
		source: "resource-error",
		description:
			"<img> com src inválido injetado no DOM — testa o listener document capture",
		fire: scenarioResourceError,
	},
	{
		id: "console-error",
		name: "console.error c/ stack",
		source: "console-error",
		description:
			"SyntaxError em parseJsonBody → attemptParse — requer VITE_OTEL_CONSOLE_ERROR_ENABLED=true",
		fire: scenarioConsoleError,
	},
	{
		id: "auth-chain",
		name: "Auth chain 3 níveis",
		source: "unhandled-rejection",
		description:
			"AuthorizationError → SessionValidationError → TokenDecodeError — segundo cenário de causa chain",
		fire: scenarioAuthChain,
	},
];

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

// ─── result table ─────────────────────────────────────────────────────────────

function ResultTable({ result }: { result: ClickhouseResult }) {
	const cols: ClickhouseColumn[] =
		(result.meta ?? []).length > 0
			? (result.meta ?? [])
			: result.data.length > 0
				? Object.keys(result.data[0] ?? {}).map((name) => ({ name, type: "" }))
				: [];

	if (result.data.length === 0) {
		return (
			<p className="py-4 text-center text-sm text-muted-foreground">
				No rows returned.
			</p>
		);
	}

	if (cols.length === 0) {
		return (
			<p className="py-4 text-center text-sm text-muted-foreground">
				Empty result set.
			</p>
		);
	}

	return (
		<div className="app-surface overflow-auto">
			<table className="w-full min-w-max text-sm">
				<thead>
					<tr className="app-surface-divider bg-muted/50">
						{cols.map((col) => (
							<th
								key={col.name}
								className="whitespace-nowrap px-3 py-2 text-left font-medium"
							>
								<div className="flex flex-col gap-0.5">
									<span>{col.name}</span>
									{col.type && (
										<span className="font-normal text-muted-foreground text-xs">
											{col.type}
										</span>
									)}
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
							className="app-surface-divider last:border-0 hover:bg-muted/30"
						>
							{cols.map((col) => (
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
	);
}

// ─── page ─────────────────────────────────────────────────────────────────────

function ProxyTestPage() {
	const { data: allConnections = [] } = useQuery(connectionsQueryOptions());
	const connections = allConnections.filter((c) => c.type === "clickhouse");

	const [mode, setMode] = useState<Mode>("saved");

	// saved mode
	const [connectionId, setConnectionId] = useState("");

	// manual mode
	const [url, setUrl] = useState("http://localhost:8123");
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
	const [lastFiredError, setLastFiredError] = useState<{
		name: string;
		source: string;
	} | null>(null);

	const canRun = mode === "saved" ? !!connectionId : !!url && !!username;

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
				: createManualClient(url, username, password);
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
					: createManualClient(url, username, password);
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
					<div className="app-surface flex w-fit items-center gap-1 p-1">
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
									<Label>URL</Label>
									<Input
										placeholder="http://localhost:8123"
										value={url}
										onChange={(e) => setUrl(e.target.value)}
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
								disabled={!url || !username}
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
								<Label className="text-muted-foreground text-xs">
									Database
								</Label>
								<Input
									className="h-8 w-32 text-xs"
									placeholder="default"
									value={db}
									onChange={(e) => setDb(e.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<Label className="text-muted-foreground text-xs">Table</Label>
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
						<p className="text-muted-foreground text-xs">Ctrl+Enter to run</p>
					</div>

					{/* Results */}
					{(result || error) && (
						<>
							<Separator />
							<div className="space-y-3">
								{result && (
									<div className="flex flex-wrap items-center gap-2">
										<span className="text-muted-foreground text-xs">
											<Terminal className="mr-1 inline size-3" />
											Results
										</span>
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
								{error ? (
									<div className="rounded-lg bg-destructive/10 p-4">
										<p className="whitespace-pre-wrap break-all font-mono text-destructive text-xs">
											{error}
										</p>
									</div>
								) : result ? (
									<ResultTable result={result} />
								) : null}
							</div>
						</>
					)}
				</CardContent>
			</Card>

			{/* OTel stack test */}
			<Card>
				<CardHeader className="gap-3">
					<div className="flex items-center gap-2">
						<Zap className="size-5" />
						<CardTitle>OTel Stack Test</CardTitle>
					</div>
					<CardDescription>
						Cada cenário dispara um erro com call stack profundo e real.
						Confirme <span className="font-mono">exception.values</span> com
						frames estruturados no POST para{" "}
						<span className="font-mono">/v1/logs</span>.
					</CardDescription>
				</CardHeader>

				<Separator />

				<CardContent className="pt-6">
					<div className="space-y-2">
						{STACK_TEST_SCENARIOS.map((scenario) => (
							<div
								key={scenario.id}
								className="flex items-center justify-between gap-4 rounded-lg border p-3"
							>
								<div className="flex min-w-0 flex-col gap-1">
									<div className="flex items-center gap-2">
										<span className="font-medium text-sm">{scenario.name}</span>
										<Badge variant="outline" className="font-mono text-xs">
											{scenario.source}
										</Badge>
										{lastFiredError?.name === scenario.name && (
											<Badge className="bg-green-500/15 text-green-700 text-xs dark:text-green-400">
												fired
											</Badge>
										)}
									</div>
									<p className="truncate text-muted-foreground text-xs">
										{scenario.description}
									</p>
								</div>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="shrink-0 gap-1.5"
									onClick={() => {
										scenario.fire();
										setLastFiredError({
											name: scenario.name,
											source: scenario.source,
										});
									}}
								>
									<Zap className="size-3" />
									Disparar
								</Button>
							</div>
						))}
					</div>

					{lastFiredError && (
						<p className="mt-4 text-muted-foreground text-xs">
							Último:{" "}
							<span className="font-mono text-foreground">
								{lastFiredError.name}
							</span>{" "}
							· verifique DevTools → Network → POST{" "}
							<span className="font-mono">/v1/logs</span> →{" "}
							<span className="font-mono">exception.values</span>
						</p>
					)}
				</CardContent>
			</Card>

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
