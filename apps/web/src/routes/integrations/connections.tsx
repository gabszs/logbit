import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	ChevronLeft,
	ChevronRight,
	Loader2,
	PlugZap,
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
import { listConnections } from "@/web/lib/sources";
import { AddConnectionDialog } from "./-components/add-connection-dialog";
import { ConnectionRow } from "./-components/connection-row";
import { IntegrationsError } from "./-components/integrations-error";
import { IntegrationsSectionSkeleton } from "./-components/integrations-section-skeleton";

const PAGE_SIZE = 20;

async function fetchConnections(page: number) {
	return await listConnections({
		page,
		page_size: PAGE_SIZE,
	});
}

function connectionsQueryOptions(page: number) {
	return queryOptions({
		queryKey: ["connections", "list", page],
		queryFn: () => fetchConnections(page),
	});
}

export const Route = createFileRoute("/integrations/connections")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(connectionsQueryOptions(1));
	},
	component: ConnectionsPage,
	pendingComponent: IntegrationsSectionSkeleton,
	errorComponent: IntegrationsError,
});

function ConnectionsPage() {
	const queryClient = useQueryClient();
	const [page, setPage] = useState(1);
	const [dialogOpen, setDialogOpen] = useState(false);

	const { data: connections = [], isFetching } = useQuery(
		connectionsQueryOptions(page),
	);

	const hasNextPage = connections.length === PAGE_SIZE;
	const hasPrevPage = page > 1;

	const handleRefresh = () => {
		queryClient.invalidateQueries({ queryKey: ["connections", "list"] });
	};

	return (
		<>
			<Card>
				<CardHeader className="relative gap-3 pr-20">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<PlugZap className="size-5" />
							<CardTitle>Connections</CardTitle>
						</div>
						<CardDescription>
							Manage the connections for your active organization.
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
							aria-label="Refresh connections"
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
							Add connection
						</Button>
					</div>
				</CardHeader>

				<Separator />

				<CardContent className="space-y-4">
					<div className="flex flex-wrap gap-2">
						<Badge variant="outline">
							{connections.length}{" "}
							{connections.length === 1 ? "connection" : "connections"}
						</Badge>
					</div>

					{connections.length === 0 && !hasPrevPage ? (
						<div className="rounded-xl border border-border/70 border-dashed bg-background/40 px-4 py-8 text-center">
							<p className="font-medium text-sm">
								No connections configured yet.
							</p>
							<p className="mt-2 text-muted-foreground text-sm">
								Add your first connection to start routing events from your
								organization.
							</p>
						</div>
					) : (
						<div className="overflow-hidden rounded-xl border border-border/70 bg-card/70">
							{connections.map((connection, index) => (
								<div key={connection.id}>
									<ConnectionRow
										connection={connection}
										onRefresh={handleRefresh}
									/>
									{index < connections.length - 1 && (
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

			<AddConnectionDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onSuccess={handleRefresh}
			/>
		</>
	);
}
