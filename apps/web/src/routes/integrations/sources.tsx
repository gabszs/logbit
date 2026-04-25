import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Database } from "lucide-react";
import type {
	SourcesListSuccessType,
	SourcesType,
} from "@/server/features/sources/schemas";
import { Badge } from "@/web/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { parseHonoResponse } from "@/web/lib/hono-rpc";
import { IntegrationsError } from "./-components/integrations-error";
import { IntegrationsSectionSkeleton } from "./-components/integrations-section-skeleton";

async function fetchSources(): Promise<SourcesType[]> {
	const response = await fetch(
		`${import.meta.env.VITE_SERVER_URL}/v1/sources`,
		{ credentials: "include" },
	);
	const result = await parseHonoResponse<SourcesListSuccessType>(response);
	return result.data;
}

const sourcesQueryOptions = queryOptions({
	queryKey: ["sources", "list"],
	queryFn: fetchSources,
});

export const Route = createFileRoute("/integrations/sources")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(sourcesQueryOptions);
	},
	component: SourcesPage,
	pendingComponent: IntegrationsSectionSkeleton,
	errorComponent: IntegrationsError,
});

const SOURCE_TYPE_LABELS: Record<SourcesType["type"], string> = {
	trace: "Trace",
	log: "Log",
	metric: "Metric",
};

function SourcesPage() {
	const { data: sources = [] } = useQuery(sourcesQueryOptions);

	return (
		<div className="space-y-6">
			{sources.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
						<Database className="size-10 text-muted-foreground/50" />
						<p className="font-medium text-sm">No sources yet</p>
						<p className="text-muted-foreground text-sm">
							Your organization has no sources configured.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-3">
					{sources.map((source) => (
						<SourceCard key={source.id} source={source} />
					))}
				</div>
			)}
		</div>
	);
}

function SourceCard({ source }: { source: SourcesType }) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
				<div className="min-w-0 space-y-1">
					<CardTitle className="text-base">{source.name}</CardTitle>
					<CardDescription className="font-mono text-xs">
						{source.id}
					</CardDescription>
				</div>
				<Badge variant="secondary">{SOURCE_TYPE_LABELS[source.type]}</Badge>
			</CardHeader>
		</Card>
	);
}
