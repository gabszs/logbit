import type { ReactNode } from "react";

export type DataRow = Record<string, unknown>;

export type RowIdentity = {
	sourceId: string;
	connectionId: string;
	tableLabel: string;
	rowWhere: string;
	selectedRowKey: string;
	aliasWith?: Array<{
		alias: string;
		expression: string;
	}>;
};

export type ResolvedRowFields = {
	timestamp?: unknown;
	traceId?: unknown;
	spanId?: unknown;
	serviceName?: unknown;
	severityText?: unknown;
	severityNumber?: unknown;
	body?: unknown;
};

export type RowPanelAttribute = {
	key: string;
	value: unknown;
};

export type RowPanelOverviewSection = {
	id: string;
	title: string;
	attributes: RowPanelAttribute[];
};

export type RowPanelOverview = {
	sections: RowPanelOverviewSection[];
};

export type RowPanelQueryResult = {
	rows: DataRow[];
};

export type RowPanelAdapter = {
	getQueryKey: (identity: RowIdentity) => readonly unknown[];
	fetchRow: (identity: RowIdentity) => Promise<RowPanelQueryResult>;
	resolveFields: (row: DataRow) => ResolvedRowFields;
	getOverview?: (
		row: DataRow,
		fields: ResolvedRowFields,
	) => RowPanelOverview | null;
	getColumnValues?: (row: DataRow) => DataRow;
	getColumnValuesLabel?: (row: DataRow, fields: ResolvedRowFields) => string;
	formatError?: (error: unknown) => string;
	renderExtraSections?: (row: DataRow) => ReactNode;
};
