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

export type RowPanelQueryResult = {
	rows: DataRow[];
};

export type RowPanelAdapter = {
	getQueryKey: (identity: RowIdentity) => readonly unknown[];
	fetchRow: (identity: RowIdentity) => Promise<RowPanelQueryResult>;
	resolveFields: (row: DataRow) => ResolvedRowFields;
	getColumnValues?: (row: DataRow) => DataRow;
	formatError?: (error: unknown) => string;
	renderExtraSections?: (row: DataRow) => ReactNode;
};
