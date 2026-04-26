import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	ChevronLeft,
	ChevronRight,
	Database,
	Loader2,
	Plus,
	RefreshCw,
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
import { Separator } from "@/web/components/ui/separator";
import { AddSourceDialog } from "./-components/add-source-dialog";
import { IntegrationsError } from "./-components/integrations-error";
import { IntegrationsSectionSkeleton } from "./-components/integrations-section-skeleton";
import { SourceRow } from "./-components/source-row";
import { getConnectionsForSourceSelect, getSources } from "./-lib/source-api";

const PAGE_SIZE = 20;

function sourcesQueryOptions(page: number) {
	return queryOptions({
		queryKey: ["sources", "list", page],
		queryFn: () => getSources(page, PAGE_SIZE),
	});
}

function connectionsQueryOptionsForSelect() {
	return queryOptions({
		queryKey: ["connections", "source-select"],
		queryFn: getConnectionsForSourceSelect,
	});
}

export const Route = createFileRoute("/integrations/sources")({
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(sourcesQueryOptions(1)),
			context.queryClient.ensureQueryData(connectionsQueryOptionsForSelect()),
		]);
	},
	component: SourcesPage,
	pendingComponent: IntegrationsSectionSkeleton,
	errorComponent: IntegrationsError,
});

function SourcesPage() {
	const queryClient = useQueryClient();
	const [page, setPage] = useState(1);
	const [dialogOpen, setDialogOpen] = useState(false);

	const { data: sources = [], isFetching: isSourcesFetching } = useQuery(
		sourcesQueryOptions(page),
	);
	const { data: connections = [], isFetching: isConnectionsFetching } =
		useQuery(connectionsQueryOptionsForSelect());

	const isFetching = isSourcesFetching || isConnectionsFetching;
	const hasNextPage = sources.length === PAGE_SIZE;
	const hasPrevPage = page > 1;

	const handleRefresh = () => {
		queryClient.invalidateQueries({ queryKey: ["sources", "list"] });
		queryClient.invalidateQueries({
			queryKey: ["connections", "source-select"],
		});
	};

	return (
		<>
			<Card>
				<CardHeader className="relative gap-3 pr-20">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Database className="size-5" />
							<CardTitle>Sources</CardTitle>
						</div>
						<CardDescription>
							Manage the sources for your active organization.
						</CardDescription>
					</div>

					<div className="absolute top-0 right-6 flex items-center gap-2">
						<Button
							type="button"
							size="icon"
							variant="outline"
							onClick={handleRefresh}
							disabled={isFetching}
							className="size-8 rounded-md"
							aria-label="Refresh sources"
						>
							{isFetching ? (
								<Loader2 className="size-3.5 animate-spin" />
							) : (
								<RefreshCw className="size-3.5" />
							)}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setDialogOpen(true)}
							className="h-8 rounded-md px-3 text-xs"
						>
							<Plus className="size-3.5" />
							Add source
						</Button>
					</div>
				</CardHeader>

				<Separator />

				<CardContent className="space-y-4">
					<div className="flex flex-wrap gap-2">
						<Badge variant="outline">
							{sources.length} {sources.length === 1 ? "source" : "sources"}
						</Badge>
						<Badge variant="outline">
							{connections.length}{" "}
							{connections.length === 1
								? "ClickHouse connection"
								: "ClickHouse connections"}
						</Badge>
					</div>

					{sources.length === 0 && !hasPrevPage ? (
						<div className="rounded-xl border border-border/70 border-dashed bg-background/40 px-4 py-8 text-center">
							<p className="font-medium text-sm">No sources configured yet.</p>
							<p className="mt-2 text-muted-foreground text-sm">
								Add your first source to define how events are read from your
								organization connections.
							</p>
						</div>
					) : (
						<div className="overflow-hidden rounded-xl border border-border/70 bg-card/70">
							{sources.map((source, index) => (
								<div key={source.id}>
									<SourceRow
										source={source}
										connections={connections}
										onRefresh={handleRefresh}
									/>
									{index < sources.length - 1 && (
										<Separator className="bg-border/70" />
									)}
								</div>
							))}
						</div>
					)}

					<div className="flex items-center justify-between">
						<span className="text-muted-foreground text-sm">Page {page}</span>
						<div className="flex gap-2">
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => setPage((p) => p - 1)}
								disabled={!hasPrevPage || isFetching}
							>
								<ChevronLeft className="size-4" />
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => setPage((p) => p + 1)}
								disabled={!hasNextPage || isFetching}
							>
								<ChevronRight className="size-4" />
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			<AddSourceDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onSuccess={handleRefresh}
				connections={connections}
			/>
		</>
	);
}
