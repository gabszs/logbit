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
	createProxyClient,
	executeClickhouseJsonQuery,
} from "@/web/lib/clickhouse-client";
import {
	type ConnectionOption,
	createSource,
	getSourcesForSourceSelect,
	type SourceEntity,
	updateSource,
} from "../-lib/source-api";

const NO_SOURCE_VALUE = "__none__";
const DEFAULT_DATABASE_OPTIONS = ["default"];
const DEFAULT_TABLE_OPTIONS = ["otel_logs", "logs", "otel_traces", "traces"];

type SourceKind = SourcesUpsertInput["type"];

type FormState = {
	name: string;
	type: SourceKind;
	connectionId: string;
	database: string;
	table: string;
	defaultSelectQuery: string;
	defaultOrderByQuery: string;
	resourceAttributesField: string;
	timestampQueryField: string;
	displayedTimestampField: string;
	serviceNameField: string;
	bodyField: string;
	traceIdField: string;
	spanIdField: string;
	luceneImplicitColumnField: string;
	queryRangeLookbackDays: string;
	queryRangeForwardDays: string;
	metricSourceId: string;
	severityField: string;
	logAttributesField: string;
	traceSourceId: string;
	sampleRateField: string;
	spanAttributesField: string;
	durationField: string;
	durationPrecisionField: string;
	parentSpanIdField: string;
	spanEventsField: string;
	spanKindField: string;
	spanNameField: string;
	statusCodeField: string;
	statusMessageField: string;
	logSourceId: string;
};

const LOG_DEFAULT_FORM: FormState = {
	name: "",
	type: "log",
	connectionId: "",
	database: "",
	table: "",
	defaultSelectQuery:
		"Timestamp, ServiceName as service, SeverityText as level, Body",
	defaultOrderByQuery: "Timestamp DESC",
	resourceAttributesField: "ResourceAttributes",
	timestampQueryField: "Timestamp",
	displayedTimestampField: "Timestamp",
	serviceNameField: "ServiceName",
	bodyField: "Body",
	traceIdField: "TraceId",
	spanIdField: "SpanId",
	luceneImplicitColumnField: "Body",
	queryRangeLookbackDays: "7",
	queryRangeForwardDays: "2",
	metricSourceId: "",
	severityField: "SeverityText",
	logAttributesField: "LogAttributes",
	traceSourceId: "",
	sampleRateField: "",
	spanAttributesField: "SpanAttributes",
	durationField: "Duration",
	durationPrecisionField: "9",
	parentSpanIdField: "ParentSpanId",
	spanEventsField: "Events",
	spanKindField: "SpanKind",
	spanNameField: "SpanName",
	statusCodeField: "StatusCode",
	statusMessageField: "StatusMessage",
	logSourceId: "",
};

const TRACE_DEFAULT_FORM: FormState = {
	...LOG_DEFAULT_FORM,
	type: "trace",
	defaultSelectQuery:
		"Timestamp, ServiceName as service, StatusCode as level, round(Duration / 1e6) as duration, SpanName",
	bodyField: "SpanName",
	luceneImplicitColumnField: "SpanName",
	severityField: "",
	logAttributesField: "",
	traceSourceId: "",
};

function sourceTypeLabel(type: SourceKind) {
	return type === "trace" ? "Trace" : "Log";
}

function defaultFormForType(type: SourceKind) {
	return type === "trace" ? TRACE_DEFAULT_FORM : LOG_DEFAULT_FORM;
}

function nullableString(value: string | null | undefined) {
	return value ?? "";
}

function optionalUuid(value: string) {
	return value.trim() || null;
}

function optionalString(value: string) {
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

function formFromSource(source: SourceEntity): FormState {
	const base = {
		...defaultFormForType(source.type),
		name: source.name,
		type: source.type,
		connectionId: source.connectionId,
		database: nullableString(source.config.database),
		table: nullableString(source.config.table),
		defaultSelectQuery: nullableString(source.config.defaultSelectQuery),
		defaultOrderByQuery: nullableString(source.config.defaultOrderByQuery),
		resourceAttributesField: nullableString(
			source.config.resourceAttributesField,
		),
		timestampQueryField: nullableString(source.config.timestampQueryField),
		displayedTimestampField: nullableString(
			source.config.displayedTimestampField,
		),
		serviceNameField: nullableString(source.config.serviceNameField),
		bodyField: nullableString(source.config.bodyField),
		traceIdField: nullableString(source.config.traceIdField),
		spanIdField: nullableString(source.config.spanIdField),
		luceneImplicitColumnField: nullableString(
			source.config.luceneImplicitColumnField,
		),
		queryRangeLookbackDays: String(
			source.config.queryRangeLimit?.lookbackDays ?? 7,
		),
		queryRangeForwardDays: String(
			source.config.queryRangeLimit?.forwardDays ?? 2,
		),
		metricSourceId: source.config.metricSourceId ?? "",
	};

	if (source.type === "trace") {
		return {
			...base,
			sampleRateField: nullableString(source.config.sampleRateField),
			spanAttributesField: nullableString(source.config.spanAttributesField),
			durationField: nullableString(source.config.durationField),
			durationPrecisionField: String(source.config.durationPrecisionField ?? 9),
			parentSpanIdField: nullableString(source.config.parentSpanIdField),
			spanEventsField: nullableString(source.config.spanEventsField),
			spanKindField: nullableString(source.config.spanKindField),
			spanNameField: nullableString(source.config.spanNameField),
			statusCodeField: nullableString(source.config.statusCodeField),
			statusMessageField: nullableString(source.config.statusMessageField),
			logSourceId: source.config.logSourceId ?? "",
		};
	}

	return {
		...base,
		severityField: nullableString(source.config.severityField),
		logAttributesField: nullableString(source.config.logAttributesField),
		traceSourceId: source.config.traceSourceId ?? "",
	};
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
	const [form, setForm] = useState<FormState>(LOG_DEFAULT_FORM);
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
		setForm(
			mode === "edit" && source ? formFromSource(source) : LOG_DEFAULT_FORM,
		);
		setFormError(null);
		setIsPending(false);
		setShowOptionalFields(false);
	}, [open, mode, source]);

	useEffect(() => {
		if (!open || !form.connectionId || !form.database.trim()) return;

		const prefetchTablesAndDatabases = async () => {
			try {
				const client = createProxyClient(form.connectionId);
				const db = form.database.trim().replace(/`/g, "");

				await Promise.all([
					executeClickhouseJsonQuery<{ name: string }>(
						client,
						"SHOW DATABASES",
					),
					executeClickhouseJsonQuery<{ name: string }>(
						client,
						`SHOW TABLES FROM \`${db}\``,
					),
				]);
			} catch {
				// Silently fail — static fallback options will be used
			}
		};

		prefetchTablesAndDatabases();
	}, [open, form.connectionId, form.database]);

	const set = <K extends keyof FormState>(field: K, value: FormState[K]) => {
		setFormError(null);
		setForm((prev) => ({ ...prev, [field]: value }));
	};

	const handleTypeChange = (type: SourceKind) => {
		setFormError(null);
		setForm((prev) => ({
			...defaultFormForType(type),
			name: prev.name,
			type,
			connectionId: prev.connectionId,
			database: prev.database,
			table: prev.table,
		}));
	};

	const parseDurationPrecision = () => {
		const value = Number(form.durationPrecisionField.trim());
		if (!Number.isInteger(value) || value < 0 || value > 9) {
			setFormError("Duration precision must be an integer from 0 to 9");
			return null;
		}
		return value;
	};

	const parseQueryRangeLimit = () => {
		const lookbackDays = Number(form.queryRangeLookbackDays.trim());
		const forwardDays = Number(form.queryRangeForwardDays.trim());
		if (!Number.isInteger(lookbackDays) || lookbackDays < 0) {
			setFormError("Query lookback days must be a non-negative integer");
			return null;
		}
		if (!Number.isInteger(forwardDays) || forwardDays < 0) {
			setFormError("Query forward days must be a non-negative integer");
			return null;
		}
		return { lookbackDays, forwardDays };
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
		const queryRangeLimit = parseQueryRangeLimit();
		if (queryRangeLimit == null) return null;

		const commonConfig = {
			database: form.database.trim() || null,
			table: form.table.trim() || null,
			defaultSelectQuery: form.defaultSelectQuery.trim(),
			defaultOrderByQuery: form.defaultOrderByQuery.trim(),
			resourceAttributesField: form.resourceAttributesField.trim(),
			timestampQueryField: form.timestampQueryField.trim(),
			displayedTimestampField: form.displayedTimestampField.trim(),
			serviceNameField: form.serviceNameField.trim(),
			bodyField: form.bodyField.trim(),
			traceIdField: form.traceIdField.trim(),
			spanIdField: form.spanIdField.trim(),
			luceneImplicitColumnField: form.luceneImplicitColumnField.trim(),
			queryRangeLimit,
			querySettings: source?.config.querySettings ?? [],
			materializedViews: source?.config.materializedViews ?? [],
			highlightedRowAttributeExpressions:
				source?.config.highlightedRowAttributeExpressions ?? [],
			highlightedTraceAttributeExpressions:
				source?.config.highlightedTraceAttributeExpressions ?? [],
			metricSourceId: optionalUuid(form.metricSourceId),
		};

		if (form.type === "trace") {
			const durationPrecisionField = parseDurationPrecision();
			if (durationPrecisionField == null) return null;

			return {
				name,
				type: "trace",
				connectionId: form.connectionId,
				config: {
					...commonConfig,
					sampleRateField: optionalString(form.sampleRateField),
					spanAttributesField: form.spanAttributesField.trim(),
					durationField: form.durationField.trim(),
					durationPrecisionField,
					parentSpanIdField: form.parentSpanIdField.trim(),
					spanEventsField: form.spanEventsField.trim(),
					spanKindField: form.spanKindField.trim(),
					spanNameField: form.spanNameField.trim(),
					statusCodeField: form.statusCodeField.trim(),
					statusMessageField: form.statusMessageField.trim(),
					logSourceId: optionalUuid(form.logSourceId),
				},
			};
		}

		return {
			name,
			type: "log",
			connectionId: form.connectionId,
			config: {
				...commonConfig,
				severityField: form.severityField.trim(),
				logAttributesField: form.logAttributesField.trim(),
				traceSourceId: optionalUuid(form.traceSourceId),
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
	const selectableLogSources = selectableSources.filter(
		(option) => option.type === "log",
	);
	const selectableTraceSources = selectableSources.filter(
		(option) => option.type === "trace",
	);
	const selectedConnectionDatabase =
		selectedConnection && selectedConnection.type === "clickhouse"
			? selectedConnection.config.database
			: null;
	const databaseOptions = uniqueOptions([
		selectedConnectionDatabase,
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
								placeholder={
									form.type === "trace"
										? "Production traces"
										: "Production logs"
								}
							/>
						</div>

						<div className="grid gap-4 sm:grid-cols-[15rem_1fr] sm:items-center">
							<Label>Type</Label>
							{isEdit ? (
								<div className="flex h-9 items-center">
									<Badge variant="secondary">
										{sourceTypeLabel(form.type)}
									</Badge>
								</div>
							) : (
								<SourceTypePicker
									value={form.type}
									onChange={handleTypeChange}
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
							disabled={isPending || !form.connectionId}
							placeholder="Select a database"
							options={databaseOptions}
							onOpen={async () => {
								if (!form.connectionId) return [];
								const client = createProxyClient(form.connectionId);
								const result = await executeClickhouseJsonQuery<{ name: string }>(
									client,
									"SHOW DATABASES",
								);
								return result.data.map((row) => row.name);
							}}
						/>

						<FieldLabel htmlFor="source-table">Table</FieldLabel>
						<SelectField
							id="source-table"
							value={form.table}
							onChange={(value) => set("table", value)}
							disabled={isPending || !form.connectionId || !form.database}
							placeholder="Select a table"
							options={tableOptions}
							onOpen={async () => {
								if (!form.connectionId || !form.database) return [];
								const client = createProxyClient(form.connectionId);
								const db = form.database.trim().replace(/`/g, "");
								const result = await executeClickhouseJsonQuery<{ name: string }>(
									client,
									`SHOW TABLES FROM \`${db}\``,
								);
								return result.data.map((row) => row.name);
							}}
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
							{form.type === "log" ? (
								<SourceSelectField
									id="source-trace-source"
									label="Trace source"
									value={form.traceSourceId}
									onChange={(value) => set("traceSourceId", value)}
									disabled={isPending || isSourcesFetching}
									sources={selectableTraceSources}
								/>
							) : (
								<SourceSelectField
									id="source-log-source"
									label="Log source"
									value={form.logSourceId}
									onChange={(value) => set("logSourceId", value)}
									disabled={isPending || isSourcesFetching}
									sources={selectableLogSources}
								/>
							)}
							<SourceSelectField
								id="source-metric-source"
								label="Metric source"
								value={form.metricSourceId}
								onChange={(value) => set("metricSourceId", value)}
								disabled
								sources={[]}
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

								<FieldInput
									id="source-timestamp"
									label="Timestamp query expression"
									value={form.timestampQueryField}
									onChange={(value) => set("timestampQueryField", value)}
									disabled={isPending}
								/>
								<FieldInput
									id="source-displayed-timestamp"
									label="Displayed timestamp expression"
									value={form.displayedTimestampField}
									onChange={(value) => set("displayedTimestampField", value)}
									disabled={isPending}
								/>
								<FieldInput
									id="source-resource-attrs"
									label="Resource attributes field"
									value={form.resourceAttributesField}
									onChange={(value) => set("resourceAttributesField", value)}
									disabled={isPending}
								/>
								<FieldInput
									id="source-service"
									label="Service name field"
									value={form.serviceNameField}
									onChange={(value) => set("serviceNameField", value)}
									disabled={isPending}
								/>
								<FieldInput
									id="source-body"
									label="Body field"
									value={form.bodyField}
									onChange={(value) => set("bodyField", value)}
									disabled={isPending}
								/>
								<FieldInput
									id="source-trace-id"
									label="Trace ID field"
									value={form.traceIdField}
									onChange={(value) => set("traceIdField", value)}
									disabled={isPending}
								/>
								<FieldInput
									id="source-span-id"
									label="Span ID field"
									value={form.spanIdField}
									onChange={(value) => set("spanIdField", value)}
									disabled={isPending}
								/>
								<FieldInput
									id="source-lucene"
									label="Lucene implicit column field"
									value={form.luceneImplicitColumnField}
									onChange={(value) => set("luceneImplicitColumnField", value)}
									disabled={isPending}
								/>
								<FieldInput
									id="source-query-lookback-days"
									label="Query lookback days"
									value={form.queryRangeLookbackDays}
									onChange={(value) => set("queryRangeLookbackDays", value)}
									disabled={isPending}
									type="number"
								/>
								<FieldInput
									id="source-query-forward-days"
									label="Query forward days"
									value={form.queryRangeForwardDays}
									onChange={(value) => set("queryRangeForwardDays", value)}
									disabled={isPending}
									type="number"
								/>

								{form.type === "log" ? (
									<>
										<FieldInput
											id="source-severity"
											label="Severity field"
											value={form.severityField}
											onChange={(value) => set("severityField", value)}
											disabled={isPending}
										/>
										<FieldInput
											id="source-log-attrs"
											label="Log attributes field"
											value={form.logAttributesField}
											onChange={(value) => set("logAttributesField", value)}
											disabled={isPending}
										/>
									</>
								) : (
									<>
										<FieldInput
											id="source-sample-rate"
											label="Sample rate field"
											value={form.sampleRateField}
											onChange={(value) => set("sampleRateField", value)}
											disabled={isPending}
										/>
										<FieldInput
											id="source-span-attrs"
											label="Span attributes field"
											value={form.spanAttributesField}
											onChange={(value) => set("spanAttributesField", value)}
											disabled={isPending}
										/>
										<FieldInput
											id="source-duration"
											label="Duration field"
											value={form.durationField}
											onChange={(value) => set("durationField", value)}
											disabled={isPending}
										/>
										<FieldInput
											id="source-duration-precision"
											label="Duration precision field"
											value={form.durationPrecisionField}
											onChange={(value) => set("durationPrecisionField", value)}
											disabled={isPending}
											type="number"
										/>
										<FieldInput
											id="source-parent-span-id"
											label="Parent span ID field"
											value={form.parentSpanIdField}
											onChange={(value) => set("parentSpanIdField", value)}
											disabled={isPending}
										/>
										<FieldInput
											id="source-span-events"
											label="Span events field"
											value={form.spanEventsField}
											onChange={(value) => set("spanEventsField", value)}
											disabled={isPending}
										/>
										<FieldInput
											id="source-span-kind"
											label="Span kind field"
											value={form.spanKindField}
											onChange={(value) => set("spanKindField", value)}
											disabled={isPending}
										/>
										<FieldInput
											id="source-span-name"
											label="Span name field"
											value={form.spanNameField}
											onChange={(value) => set("spanNameField", value)}
											disabled={isPending}
										/>
										<FieldInput
											id="source-status-code"
											label="Status code field"
											value={form.statusCodeField}
											onChange={(value) => set("statusCodeField", value)}
											disabled={isPending}
										/>
										<FieldInput
											id="source-status-message"
											label="Status message field"
											value={form.statusMessageField}
											onChange={(value) => set("statusMessageField", value)}
											disabled={isPending}
										/>
									</>
								)}
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

function FieldInput({
	id,
	label,
	value,
	onChange,
	disabled,
	placeholder,
	type = "text",
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
	placeholder?: string;
	type?: "text" | "number";
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type={type}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
				placeholder={placeholder}
				className="font-mono"
				min={type === "number" ? 0 : undefined}
				max={type === "number" ? 9 : undefined}
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
	onOpen,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
	placeholder: string;
	options: string[];
	onOpen?: () => Promise<string[]>;
}) {
	const [isLoading, setIsLoading] = useState(false);
	const [dynamicOptions, setDynamicOptions] = useState<string[]>([]);
	const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

	const handleOpenChange = async (isOpen: boolean) => {
		if (!isOpen || !onOpen || hasLoadedOnce) return;

		setIsLoading(true);
		try {
			const result = await onOpen();
			setDynamicOptions(result);
			setHasLoadedOnce(true);
		} catch {
			// Silently fail — static options will be used
		} finally {
			setIsLoading(false);
		}
	};

	const allOptions = uniqueOptions([...dynamicOptions, ...options]);

	return (
		<Select
			value={value}
			onValueChange={onChange}
			disabled={disabled || (isLoading && allOptions.length === 0)}
			onOpenChange={handleOpenChange}
		>
			<SelectTrigger id={id} className="w-full">
				{isLoading && !hasLoadedOnce ? (
					<span className="flex items-center gap-2 text-muted-foreground">
						<Loader2 className="size-3.5 animate-spin" />
						Loading...
					</span>
				) : (
					<SelectValue placeholder={placeholder} />
				)}
			</SelectTrigger>
			<SelectContent>
				{allOptions.map((option) => (
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
		</div>
	);
}

function SourceTypePicker({
	value,
	onChange,
	disabled,
}: {
	value: SourceKind;
	onChange: (value: SourceKind) => void;
	disabled: boolean;
}) {
	const options = [
		{ value: "log", label: "Log", enabled: true },
		{ value: "trace", label: "Trace", enabled: true },
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
							if (option.enabled) onChange(option.value);
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
