import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type {
	ConnectionEntityType,
	ConnectionUpsertInput,
} from "@/server/features/connections/schemas";
import { Button } from "@/web/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/web/components/ui/dialog";
import { Input } from "@/web/components/ui/input";
import { Label } from "@/web/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/web/components/ui/select";
import { Switch } from "@/web/components/ui/switch";
import { getResponseErrorMessage, honoClient } from "@/web/lib/hono-rpc";
import type { SupportedIntegrationKind } from "@/web/lib/integrations";
import {
	INTEGRATIONS,
	supportedIntegrationTypes,
} from "@/web/lib/integrations";
import {
	pingClickhouseConnection,
	queryTestClickhouseConnection,
} from "../-lib/clickhouse-client";

const CONNECTION_TYPES = supportedIntegrationTypes.map((value) => ({
	value,
	label: INTEGRATIONS[value].name,
	Logo: INTEGRATIONS[value].logo,
}));

type FormState = {
	name: string;
	isActive: boolean;
	type: SupportedIntegrationKind | "";
	// resend
	resendApiKey: string;
	// cloudflare
	cfApiKey: string;
	cfZoneId: string;
	// clickhouse
	chHost: string;
	chDatabase: string;
	chUsername: string;
	chPassword: string;
};

type ClickhouseTestStatus = "idle" | "testing" | "ok" | "fail";

const EMPTY_FORM: FormState = {
	name: "",
	isActive: true,
	type: "",
	resendApiKey: "",
	cfApiKey: "",
	cfZoneId: "",
	chHost: "",
	chDatabase: "",
	chUsername: "",
	chPassword: "",
};

function formFromConnection(c: ConnectionEntityType): FormState {
	const base: FormState = {
		...EMPTY_FORM,
		name: c.name,
		isActive: c.isActive,
		type: c.type,
	};
	if (c.type === "resend") {
		return { ...base, resendApiKey: c.config.apiKey };
	}
	if (c.type === "cloudflare") {
		return { ...base, cfApiKey: c.config.apiKey, cfZoneId: c.config.zoneId };
	}
	if (c.type === "clickhouse") {
		return {
			...base,
			chHost: c.config.host,
			chDatabase: c.config.database ?? "",
			chUsername: c.config.username,
			chPassword: c.config.password ?? "",
		};
	}
	return base;
}

export type AddConnectionDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
	mode?: "create" | "edit";
	connection?: ConnectionEntityType;
};

export function AddConnectionDialog({
	open,
	onOpenChange,
	onSuccess,
	mode = "create",
	connection,
}: AddConnectionDialogProps) {
	const [form, setForm] = useState<FormState>(EMPTY_FORM);
	const [isPending, setIsPending] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [clickhousePingStatus, setClickhousePingStatus] =
		useState<ClickhouseTestStatus>("idle");
	const [clickhouseQueryTestStatus, setClickhouseQueryTestStatus] =
		useState<ClickhouseTestStatus>("idle");

	useEffect(() => {
		if (!open) return;
		setForm(
			mode === "edit" && connection
				? formFromConnection(connection)
				: EMPTY_FORM,
		);
		setFormError(null);
		setClickhousePingStatus("idle");
		setClickhouseQueryTestStatus("idle");
		setIsPending(false);
	}, [open, mode, connection]);

	const set = (field: keyof FormState, value: string | boolean) => {
		setFormError(null);
		setClickhousePingStatus("idle");
		setClickhouseQueryTestStatus("idle");
		setForm((prev) => ({ ...prev, [field]: value }));
	};

	const getClickhouseTestPayload = () => ({
		host: form.chHost.trim(),
		username: form.chUsername.trim(),
		password: form.chPassword || null,
		database: form.chDatabase.trim() || null,
	});

	const getClickhouseErrorMessage = (error: unknown) =>
		error instanceof Error
			? error.message
			: "Could not reach the ClickHouse host";

	const handleClickhousePingTest = async () => {
		if (form.type !== "clickhouse") return;

		if (!form.chHost.trim() || !form.chUsername.trim()) {
			setFormError("Host and username are required to test ClickHouse");
			return;
		}

		setFormError(null);
		setClickhousePingStatus("testing");
		try {
			const result = await pingClickhouseConnection(getClickhouseTestPayload());
			setClickhousePingStatus(result.success ? "ok" : "fail");
			if (!result.success) {
				toast.error(result.error ?? "Could not reach the ClickHouse host");
			} else {
				toast.success("ClickHouse ping successful");
			}
		} catch (error) {
			setClickhousePingStatus("fail");
			toast.error(getClickhouseErrorMessage(error));
		}
	};

	const handleClickhouseQueryTest = async () => {
		if (form.type !== "clickhouse") return;

		if (!form.chHost.trim() || !form.chUsername.trim()) {
			setFormError("Host and username are required to test ClickHouse");
			return;
		}

		setFormError(null);
		setClickhouseQueryTestStatus("testing");
		try {
			const result = await queryTestClickhouseConnection(
				getClickhouseTestPayload(),
			);
			setClickhouseQueryTestStatus(result.success ? "ok" : "fail");
			if (!result.success) {
				toast.error(result.error ?? "Failed to query ClickHouse");
			} else {
				toast.success("ClickHouse query test successful");
			}
		} catch (error) {
			setClickhouseQueryTestStatus("fail");
			toast.error(getClickhouseErrorMessage(error));
		}
	};

	const buildPayload = (): ConnectionUpsertInput | null => {
		const name = form.name.trim();
		if (!name) {
			setFormError("Name is required");
			return null;
		}
		if (!form.type) {
			setFormError("Type is required");
			return null;
		}

		if (form.type === "resend") {
			if (!form.resendApiKey.trim()) {
				setFormError("API Key is required");
				return null;
			}
			return {
				name,
				isActive: form.isActive,
				type: "resend",
				config: { apiKey: form.resendApiKey.trim() },
			};
		}

		if (form.type === "cloudflare") {
			if (!form.cfApiKey.trim()) {
				setFormError("API Key is required");
				return null;
			}
			if (!form.cfZoneId.trim()) {
				setFormError("Zone ID is required");
				return null;
			}
			return {
				name,
				isActive: form.isActive,
				type: "cloudflare",
				config: { apiKey: form.cfApiKey.trim(), zoneId: form.cfZoneId.trim() },
			};
		}

		if (form.type === "clickhouse") {
			if (!form.chHost.trim()) {
				setFormError("Host is required");
				return null;
			}
			if (!form.chUsername.trim()) {
				setFormError("Username is required");
				return null;
			}
			return {
				name,
				isActive: form.isActive,
				type: "clickhouse",
				config: {
					host: form.chHost.trim(),
					database: form.chDatabase.trim() || null,
					username: form.chUsername.trim(),
					password: form.chPassword,
				},
			};
		}

		return null;
	};

	const handleSubmit = async () => {
		const payload = buildPayload();
		if (!payload) return;

		setIsPending(true);
		try {
			const response =
				mode === "edit" && connection
					? await honoClient.v1.connections[":id"].$patch({
							header: {},
							param: { id: connection.id },
							json: {
								name: payload.name,
								isActive: payload.isActive,
								config: payload.config,
							},
						})
					: await honoClient.v1.connections.$post({
							header: {},
							json: payload,
						});
			if (!response.ok) {
				throw new Error(await getResponseErrorMessage(response));
			}
			toast.success(
				mode === "edit"
					? "Connection updated successfully"
					: "Connection created successfully",
			);
			onSuccess();
			onOpenChange(false);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: mode === "edit"
						? "Failed to update connection"
						: "Failed to create connection";
			setFormError(message);
			toast.error(message);
		} finally {
			setIsPending(false);
		}
	};

	const isEdit = mode === "edit";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Edit connection" : "Add connection"}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Update the connection credentials for your organization."
							: "Configure a new connection for your organization."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
						<Label htmlFor="conn-name">Name</Label>
						<Input
							id="conn-name"
							value={form.name}
							onChange={(e) => set("name", e.target.value)}
							disabled={isPending}
							placeholder="My connection"
						/>
					</div>

					<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
						<Label htmlFor="conn-type">Type</Label>
						<Select
							value={form.type}
							onValueChange={(v) => set("type", v)}
							disabled={isPending || isEdit}
						>
							<SelectTrigger id="conn-type" className="w-full">
								<SelectValue placeholder="Select a type" />
							</SelectTrigger>
							<SelectContent>
								{CONNECTION_TYPES.map((t) => (
									<SelectItem key={t.value} value={t.value}>
										<div className="flex items-center gap-2">
											<t.Logo className="size-4 shrink-0 text-foreground" />
											{t.label}
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
						<Label htmlFor="conn-active">Active</Label>
						<div className="flex items-center">
							<Switch
								id="conn-active"
								checked={form.isActive}
								onCheckedChange={(v) => set("isActive", v)}
								disabled={isPending}
							/>
						</div>
					</div>

					{form.type === "resend" && (
						<div className="space-y-4 border-t pt-4">
							<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
								<Label htmlFor="conn-resend-key">API Key</Label>
								<Input
									id="conn-resend-key"
									value={form.resendApiKey}
									onChange={(e) => set("resendApiKey", e.target.value)}
									disabled={isPending}
									placeholder="re_..."
								/>
							</div>
						</div>
					)}

					{form.type === "cloudflare" && (
						<div className="space-y-4 border-t pt-4">
							<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
								<Label htmlFor="conn-cf-key">API Key</Label>
								<Input
									id="conn-cf-key"
									value={form.cfApiKey}
									onChange={(e) => set("cfApiKey", e.target.value)}
									disabled={isPending}
									placeholder="your-api-key"
								/>
							</div>
							<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
								<Label htmlFor="conn-cf-zone">Zone ID</Label>
								<Input
									id="conn-cf-zone"
									value={form.cfZoneId}
									onChange={(e) => set("cfZoneId", e.target.value)}
									disabled={isPending}
									placeholder="abc123def456..."
								/>
							</div>
						</div>
					)}

					{form.type === "clickhouse" && (
						<div className="space-y-4 border-t pt-4">
							<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
								<Label htmlFor="conn-ch-host">Host</Label>
								<Input
									id="conn-ch-host"
									value={form.chHost}
									onChange={(e) => set("chHost", e.target.value)}
									disabled={isPending}
									placeholder="http://localhost:8123"
								/>
							</div>
							<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
								<Label htmlFor="conn-ch-database">
									Database{" "}
									<span className="text-muted-foreground text-xs">
										(optional)
									</span>
								</Label>
								<Input
									id="conn-ch-database"
									value={form.chDatabase}
									onChange={(e) => set("chDatabase", e.target.value)}
									disabled={isPending}
									placeholder="default"
								/>
							</div>
							<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
								<Label htmlFor="conn-ch-username">Username</Label>
								<Input
									id="conn-ch-username"
									value={form.chUsername}
									onChange={(e) => set("chUsername", e.target.value)}
									disabled={isPending}
									placeholder="default"
								/>
							</div>
							<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
								<Label htmlFor="conn-ch-password">Password</Label>
								<Input
									id="conn-ch-password"
									type="password"
									value={form.chPassword}
									onChange={(e) => set("chPassword", e.target.value)}
									disabled={isPending}
									placeholder="••••••••"
								/>
							</div>
						</div>
					)}

					{formError && <p className="text-destructive text-sm">{formError}</p>}
				</div>

				<DialogFooter className="gap-2 sm:flex-wrap">
					{form.type === "clickhouse" && (
						<div className="flex flex-wrap items-center gap-2">
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={handleClickhousePingTest}
									disabled={isPending || clickhousePingStatus === "testing"}
									className="px-3"
								>
									{clickhousePingStatus === "testing" ? (
										<Loader2 className="size-4 animate-spin" />
									) : clickhousePingStatus === "ok" ? (
										<CheckCircle2 className="size-4 text-emerald-500" />
									) : clickhousePingStatus === "fail" ? (
										<AlertCircle className="size-4 text-destructive" />
									) : null}
									Ping
								</Button>
							</div>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={handleClickhouseQueryTest}
									disabled={
										isPending || clickhouseQueryTestStatus === "testing"
									}
									className="px-3"
								>
									{clickhouseQueryTestStatus === "testing" ? (
										<Loader2 className="size-4 animate-spin" />
									) : clickhouseQueryTestStatus === "ok" ? (
										<CheckCircle2 className="size-4 text-emerald-500" />
									) : clickhouseQueryTestStatus === "fail" ? (
										<AlertCircle className="size-4 text-destructive" />
									) : null}
									Query test
								</Button>
							</div>
						</div>
					)}
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button type="button" onClick={handleSubmit} disabled={isPending}>
						{isPending ? (
							<>
								<Loader2 className="size-4 animate-spin" />
								{isEdit ? "Saving..." : "Creating..."}
							</>
						) : isEdit ? (
							"Save changes"
						) : (
							"Create connection"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
