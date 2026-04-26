import { useQuery } from "@tanstack/react-query";
import {
	ChevronDown,
	Circle,
	CircleDot,
	Loader2,
	Settings2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type {
	SourcesUpsertInput,
	SourceUpdateInput,
} from "@/server/features/sources/schemas";
import { Badge } from "@/web/components/ui/badge";
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
import { Textarea } from "@/web/components/ui/textarea";
import { cn } from "@/web/utils/cn";
import {
	type ConnectionOption,
	createSource,
	getSourcesForSourceSelect,
	type SourceEntity,
	updateSource,
} from "../-lib/source-api";

const NO_SOURCE_VALUE = "__none__";
const DEFAULT_DATABASE_OPTIONS = ["default"];
const DEFAULT_TABLE_OPTIONS = ["otel_logs", "logs"];

type FormState = {
	name: string;
	type: "log";
	connectionId: string;
	database: string;
	table: string;
	defaultSelectQuery: string;
	defaultOrderByQuery: string;
	severityField: string;
	resourceAttributesField: string;
	logAttributesField: string;
	timestampField: string;
	serviceNameField: string;
	bodyField: string;
	traceIdField: string;
	spanIdField: string;
	luceneImplicitColumnField: string;
	traceSourceId: string;
	metricSourceId: string;
};

const DEFAULT_FORM: FormState = {
	name: "",
	type: "log",
	connectionId: "",
	database: "",
	table: "",
	defaultSelectQuery:
		"Timestamp, ServiceName as service, SeverityText as level, Body",
	defaultOrderByQuery: "Timestamp DESC",
	severityField: "SeverityText",
	resourceAttributesField: "ResourceAttributes",
	logAttributesField: "LogAttributes",
	timestampField: "Timestamp",
	serviceNameField: "ServiceName",
	bodyField: "Body",
	traceIdField: "TraceId",
	spanIdField: "SpanId",
	luceneImplicitColumnField: "Body",
	traceSourceId: "",
	metricSourceId: "",
};

function nullableString(value: string | null) {
	return value ?? "";
}

function formFromSource(source: SourceEntity): FormState {
	return {
		...DEFAULT_FORM,
		name: source.name,
		type: source.type,
		connectionId: source.connectionId,
		database: nullableString(source.config.database),
		table: nullableString(source.config.table),
		defaultSelectQuery: nullableString(source.config.defaultSelectQuery),
		defaultOrderByQuery: nullableString(source.config.defaultOrderByQuery),
		severityField: nullableString(source.config.severityField),
		resourceAttributesField: nullableString(
			source.config.resourceAttributesField,
		),
		logAttributesField: nullableString(source.config.logAttributesField),
		timestampField: nullableString(source.config.timestampField),
		serviceNameField: nullableString(source.config.serviceNameField),
		bodyField: nullableString(source.config.bodyField),
		traceIdField: nullableString(source.config.traceIdField),
		spanIdField: nullableString(source.config.spanIdField),
		luceneImplicitColumnField: nullableString(
			source.config.luceneImplicitColumnField,
		),
		traceSourceId: source.config.traceSourceId ?? "",
		metricSourceId: source.config.metricSourceId ?? "",
	};
}

function optionalUuid(value: string) {
	return value.trim() || null;
}

function uniqueOptions(values: Array<string | null | undefined>) {
	return Array.from(
		new Set(
			values
				.map((value) => value?.trim())
				.filter((value): value is string => Boolean(value)),
		),
	);
}

type AddSourceDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
	connections: ConnectionOption[];
	mode?: "create" | "edit";
	source?: SourceEntity;
};

export function AddSourceDialog({
	open,
	onOpenChange,
	onSuccess,
	connections,
	mode = "create",
	source,
}: AddSourceDialogProps) {
	const [form, setForm] = useState<FormState>(DEFAULT_FORM);
	const [isPending, setIsPending] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [showOptionalFields, setShowOptionalFields] = useState(false);
	const { data: sourceOptions = [], isFetching: isSourcesFetching } = useQuery({
		queryKey: ["sources", "source-select"],
		queryFn: getSourcesForSourceSelect,
		enabled: open,
	});

	useEffect(() => {
		if (!open) return;
		setForm(mode === "edit" && source ? formFromSource(source) : DEFAULT_FORM);
		setFormError(null);
		setIsPending(false);
		setShowOptionalFields(false);
	}, [open, mode, source]);

	const set = (field: keyof FormState, value: string) => {
		setFormError(null);
		setForm((prev) => ({ ...prev, [field]: value }));
	};

	const buildPayload = (): SourcesUpsertInput | null => {
		const name = form.name.trim();
		if (!name) {
			setFormError("Name is required");
			return null;
		}
		if (!form.connectionId) {
			setFormError("Connection is required");
			return null;
		}

		return {
			name,
			type: "log",
			connectionId: form.connectionId,
			config: {
				database: form.database.trim() || null,
				table: form.table.trim() || null,
				defaultSelectQuery: form.defaultSelectQuery.trim(),
				defaultOrderByQuery: form.defaultOrderByQuery.trim(),
				severityField: form.severityField.trim(),
				resourceAttributesField: form.resourceAttributesField.trim(),
				logAttributesField: form.logAttributesField.trim(),
				timestampField: form.timestampField.trim(),
				serviceNameField: form.serviceNameField.trim(),
				bodyField: form.bodyField.trim(),
				traceIdField: form.traceIdField.trim(),
				spanIdField: form.spanIdField.trim(),
				luceneImplicitColumnField: form.luceneImplicitColumnField.trim(),
				traceSourceId: optionalUuid(form.traceSourceId),
				metricSourceId: optionalUuid(form.metricSourceId),
			},
		};
	};

	const handleSubmit = async () => {
		const payload = buildPayload();
		if (!payload) return;

		setIsPending(true);
		try {
			if (mode === "edit" && source) {
				const updatePayload: SourceUpdateInput = {
					name: payload.name,
					connectionId: payload.connectionId,
					config: payload.config,
				};
				await updateSource(source.id, updatePayload);
			} else {
				await createSource(payload);
			}
			toast.success(
				mode === "edit"
					? "Source updated successfully"
					: "Source created successfully",
			);
			onSuccess();
			onOpenChange(false);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: mode === "edit"
						? "Failed to update source"
						: "Failed to create source";
			setFormError(message);
			toast.error(message);
		} finally {
			setIsPending(false);
		}
	};

	const isEdit = mode === "edit";
	const selectedConnection = connections.find(
		(connection) => connection.id === form.connectionId,
	);
	const selectableSources = sourceOptions.filter(
		(option) => option.id !== source?.id,
	);
	const databaseOptions = uniqueOptions([
		selectedConnection?.type === "clickhouse"
			? selectedConnection.config.database
			: null,
		form.database,
		...sourceOptions.map((option) => option.config.database),
		...DEFAULT_DATABASE_OPTIONS,
	]);
	const tableOptions = uniqueOptions([
		form.table,
		...sourceOptions.map((option) => option.config.table),
		...DEFAULT_TABLE_OPTIONS,
	]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{isEdit ? "Edit source" : "Add source"}</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Update the source configuration for your organization."
							: "Configure a new source for your organization."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-5">
					<div className="space-y-4">
						<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
							<Label htmlFor="source-name">Name</Label>
							<Input
								id="source-name"
								value={form.name}
								onChange={(e) => set("name", e.target.value)}
								disabled={isPending}
								placeholder="Production logs"
							/>
						</div>

						<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
							<Label>Type</Label>
							{isEdit ? (
								<div className="flex h-9 items-center">
									<Badge variant="secondary">Log</Badge>
								</div>
							) : (
								<SourceTypePicker
									value={form.type}
									onChange={(value) => set("type", value)}
									disabled={isPending}
								/>
							)}
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-[15rem_1fr]">
						<FieldLabel htmlFor="source-connection">Connection</FieldLabel>
						<div className="space-y-2">
							<Select
								value={form.connectionId}
								onValueChange={(value) => set("connectionId", value)}
								disabled={isPending || connections.length === 0}
							>
								<SelectTrigger id="source-connection" className="w-full">
									<SelectValue placeholder="Select a connection" />
								</SelectTrigger>
								<SelectContent>
									{connections.map((connection) => (
										<SelectItem key={connection.id} value={connection.id}>
											{connection.name} · {connection.type} ·{" "}
											{connection.isActive ? "active" : "inactive"}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{connections.length === 0 && (
								<p className="text-muted-foreground text-xs">
									Add a ClickHouse connection before creating sources.
								</p>
							)}
						</div>

						<FieldLabel htmlFor="source-database">Database</FieldLabel>
						<SelectField
							id="source-database"
							value={form.database}
							onChange={(value) => set("database", value)}
							disabled={isPending}
							placeholder="Select a database"
							options={databaseOptions}
						/>

						<FieldLabel htmlFor="source-table">Table</FieldLabel>
						<SelectField
							id="source-table"
							value={form.table}
							onChange={(value) => set("table", value)}
							disabled={isPending}
							placeholder="Select a table"
							options={tableOptions}
						/>
					</div>

					<div className="space-y-3">
						<div className="flex items-center gap-3">
							<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								Correlations
							</span>
							<div className="flex-1 border-t" />
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<SourceSelectField
								id="source-trace-source"
								label="Trace source"
								value={form.traceSourceId}
								onChange={(value) => set("traceSourceId", value)}
								disabled={isPending || isSourcesFetching}
								sources={selectableSources}
							/>
							<SourceSelectField
								id="source-metric-source"
								label="Metric source"
								value={form.metricSourceId}
								onChange={(value) => set("metricSourceId", value)}
								disabled={isPending || isSourcesFetching}
								sources={selectableSources}
							/>
						</div>
					</div>

					<div className="space-y-4 border-t pt-4">
						<Button
							type="button"
							variant="link"
							size="sm"
							onClick={() => setShowOptionalFields((value) => !value)}
							className="h-auto gap-2 px-0 text-xs"
						>
							<Settings2 className="size-3.5" />
							Configure optional fields
							<ChevronDown
								className={
									showOptionalFields
										? "size-3.5 rotate-180 transition-transform"
										: "size-3.5 transition-transform"
								}
							/>
						</Button>

						{showOptionalFields && (
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2 sm:col-span-2">
									<Label htmlFor="source-default-select">
										Default select query
									</Label>
									<Textarea
										id="source-default-select"
										value={form.defaultSelectQuery}
										onChange={(e) => set("defaultSelectQuery", e.target.value)}
										disabled={isPending}
										className="min-h-20 font-mono text-xs"
									/>
								</div>

								<div className="space-y-2 sm:col-span-2">
									<Label htmlFor="source-default-order">
										Default order by query
									</Label>
									<Input
										id="source-default-order"
										value={form.defaultOrderByQuery}
										onChange={(e) => set("defaultOrderByQuery", e.target.value)}
										disabled={isPending}
										className="font-mono"
									/>
								</div>

								<LogField
									id="source-severity"
									label="Severity field"
									value={form.severityField}
									onChange={(value) => set("severityField", value)}
									disabled={isPending}
								/>
								<LogField
									id="source-resource-attrs"
									label="Resource attributes field"
									value={form.resourceAttributesField}
									onChange={(value) => set("resourceAttributesField", value)}
									disabled={isPending}
								/>
								<LogField
									id="source-log-attrs"
									label="Log attributes field"
									value={form.logAttributesField}
									onChange={(value) => set("logAttributesField", value)}
									disabled={isPending}
								/>
								<LogField
									id="source-timestamp"
									label="Timestamp field"
									value={form.timestampField}
									onChange={(value) => set("timestampField", value)}
									disabled={isPending}
								/>
								<LogField
									id="source-service"
									label="Service name field"
									value={form.serviceNameField}
									onChange={(value) => set("serviceNameField", value)}
									disabled={isPending}
								/>
								<LogField
									id="source-body"
									label="Body field"
									value={form.bodyField}
									onChange={(value) => set("bodyField", value)}
									disabled={isPending}
								/>
								<LogField
									id="source-trace-id"
									label="Trace ID field"
									value={form.traceIdField}
									onChange={(value) => set("traceIdField", value)}
									disabled={isPending}
								/>
								<LogField
									id="source-span-id"
									label="Span ID field"
									value={form.spanIdField}
									onChange={(value) => set("spanIdField", value)}
									disabled={isPending}
								/>
								<LogField
									id="source-lucene"
									label="Lucene implicit column field"
									value={form.luceneImplicitColumnField}
									onChange={(value) => set("luceneImplicitColumnField", value)}
									disabled={isPending}
								/>
							</div>
						)}
					</div>

					{formError && <p className="text-destructive text-sm">{formError}</p>}
				</div>

				<DialogFooter className="gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleSubmit}
						disabled={isPending || connections.length === 0}
					>
						{isPending ? (
							<>
								<Loader2 className="size-4 animate-spin" />
								{isEdit ? "Saving..." : "Creating..."}
							</>
						) : isEdit ? (
							"Save changes"
						) : (
							"Create source"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function LogField({
	id,
	label,
	value,
	onChange,
	disabled,
	placeholder,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
	placeholder?: string;
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
				placeholder={placeholder}
				className="font-mono"
			/>
		</div>
	);
}

function FieldLabel({
	htmlFor,
	children,
}: {
	htmlFor: string;
	children: ReactNode;
}) {
	return (
		<Label
			htmlFor={htmlFor}
			className="flex min-h-9 items-center text-muted-foreground text-sm"
		>
			{children}
		</Label>
	);
}

function SelectField({
	id,
	value,
	onChange,
	disabled,
	placeholder,
	options,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
	placeholder: string;
	options: string[];
}) {
	return (
		<Select
			value={value}
			onValueChange={onChange}
			disabled={disabled || options.length === 0}
		>
			<SelectTrigger id={id} className="w-full">
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option} value={option}>
						{option}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function SourceSelectField({
	id,
	label,
	value,
	onChange,
	disabled,
	sources,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
	sources: SourceEntity[];
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Select
				value={value || NO_SOURCE_VALUE}
				onValueChange={(nextValue) =>
					onChange(nextValue === NO_SOURCE_VALUE ? "" : nextValue)
				}
				disabled={disabled}
			>
				<SelectTrigger id={id} className="w-full">
					<SelectValue placeholder="Select a source" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NO_SOURCE_VALUE}>No source</SelectItem>
					{sources.map((source) => (
						<SelectItem key={source.id} value={source.id}>
							{source.name} · {source.type}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{sources.length === 0 && (
				<p className="text-muted-foreground text-xs">
					No other sources available yet.
				</p>
			)}
		</div>
	);
}

function SourceTypePicker({
	value,
	onChange,
	disabled,
}: {
	value: "log";
	onChange: (value: "log") => void;
	disabled: boolean;
}) {
	const options = [
		{ value: "log", label: "Log", enabled: true },
		{ value: "trace", label: "Trace", enabled: false },
		{ value: "metric", label: "Metrics", enabled: false },
	] as const;

	return (
		<div className="flex min-h-9 flex-wrap items-center gap-3">
			{options.map((option) => {
				const checked = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						onClick={() => {
							if (option.enabled) onChange("log");
						}}
						disabled={disabled || !option.enabled}
						className={cn(
							"inline-flex items-center gap-2 rounded-md text-sm transition-colors",
							checked
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
							(disabled || !option.enabled) && "cursor-not-allowed opacity-55",
						)}
						aria-pressed={checked}
					>
						{checked ? (
							<CircleDot className="size-5 text-primary" />
						) : (
							<Circle className="size-5" />
						)}
						<span>{option.label}</span>
					</button>
				);
			})}
		</div>
	);
}
