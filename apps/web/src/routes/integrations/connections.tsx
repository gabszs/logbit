import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PlugZap } from "lucide-react";
import type { ConnectionListSuccessType } from "@/server/features/connections/schemas";
import type {
	SupportedIntegrationKind,
	SupportedIntegrationSchemasTypes,
} from "@/server/integrations/senderFactory";
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

async function fetchConnections(): Promise<SupportedIntegrationSchemasTypes[]> {
	const response = await fetch(
		`${import.meta.env.VITE_SERVER_URL}/v1/connections`,
		{ credentials: "include" },
	);
	const result = await parseHonoResponse<ConnectionListSuccessType>(response);
	return result.data;
}

const connectionsQueryOptions = queryOptions({
	queryKey: ["connections", "list"],
	queryFn: fetchConnections,
});

export const Route = createFileRoute("/integrations/connections")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(connectionsQueryOptions);
	},
	component: ConnectionsPage,
	pendingComponent: IntegrationsSectionSkeleton,
	errorComponent: IntegrationsError,
});

const CONNECTION_TYPE_LABELS: Record<SupportedIntegrationKind, string> = {
	webhook: "Webhook",
	cloudflare_email: "Cloudflare Email",
	resend: "Resend",
};

function ConnectionsPage() {
	const { data: connections = [] } = useQuery(connectionsQueryOptions);

	return (
		<div className="space-y-6">
			{connections.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
						<PlugZap className="size-10 text-muted-foreground/50" />
						<p className="font-medium text-sm">No connections yet</p>
						<p className="text-muted-foreground text-sm">
							Your organization has no connections configured.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-3">
					{connections.map((connection) => (
						<ConnectionCard key={connection.id} connection={connection} />
					))}
				</div>
			)}
		</div>
	);
}

function ConnectionCard({
	connection,
}: {
	connection: SupportedIntegrationSchemasTypes;
}) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
				<div className="min-w-0 space-y-1">
					<CardTitle className="text-base">{connection.name}</CardTitle>
					<CardDescription className="font-mono text-xs">
						{connection.id}
					</CardDescription>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Badge variant="secondary">
						{CONNECTION_TYPE_LABELS[connection.type]}
					</Badge>
					<Badge variant={connection.isActive ? "default" : "outline"}>
						{connection.isActive ? "Active" : "Inactive"}
					</Badge>
				</div>
			</CardHeader>
		</Card>
	);
}
