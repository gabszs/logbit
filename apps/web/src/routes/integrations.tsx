import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PlugZap } from "lucide-react";
import type {
	IntegrationsListSuccessType,
	IntegrationsType,
} from "@/server/features/integrations/schemas";
import { Badge } from "@/web/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { parseHonoResponse } from "@/web/lib/hono-rpc";
import { requireAuthenticated } from "@/web/lib/route-guards";

async function fetchIntegrations(): Promise<IntegrationsType[]> {
	const response = await fetch(
		`${import.meta.env.VITE_SERVER_URL}/v1/integrations`,
		{ credentials: "include" },
	);
	const result =
		await parseHonoResponse<IntegrationsListSuccessType>(response);
	return result.data;
}

const integrationsQueryOptions = queryOptions({
	queryKey: ["integrations", "list"],
	queryFn: fetchIntegrations,
});

export const Route = createFileRoute("/integrations")({
	beforeLoad: async (opts) => {
		await requireAuthenticated({
			authClient: opts.context.authClient,
			location: opts.location,
		});
	},
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(integrationsQueryOptions);
	},
	component: IntegrationsPage,
	pendingComponent: IntegrationsSkeleton,
	errorComponent: IntegrationsError,
});

const INTEGRATION_TYPE_LABELS: Record<IntegrationsType["type"], string> = {
	webhook: "Webhook",
	cloudflare_email: "Cloudflare Email",
	resend: "Resend",
};

function IntegrationsPage() {
	const { data: integrations = [] } = useQuery(integrationsQueryOptions);

	return (
		<div className="px-3 pt-19 pb-8 sm:px-5">
			<div className="mx-auto w-full max-w-5xl space-y-6">
				<div>
					<h1 className="font-semibold text-2xl tracking-tight">
						Integrations
					</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Manage the integrations for your active organization.
					</p>
				</div>

				{integrations.length === 0 ? (
					<Card>
						<CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
							<PlugZap className="size-10 text-muted-foreground/50" />
							<p className="font-medium text-sm">No integrations yet</p>
							<p className="text-muted-foreground text-sm">
								Your organization has no integrations configured.
							</p>
						</CardContent>
					</Card>
				) : (
					<div className="grid gap-3">
						{integrations.map((integration) => (
							<IntegrationCard key={integration.id} integration={integration} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function IntegrationCard({ integration }: { integration: IntegrationsType }) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
				<div className="min-w-0 space-y-1">
					<CardTitle className="text-base">{integration.name}</CardTitle>
					<CardDescription className="font-mono text-xs">
						{integration.id}
					</CardDescription>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Badge variant="secondary">
						{INTEGRATION_TYPE_LABELS[integration.type]}
					</Badge>
					<Badge variant={integration.isActive ? "default" : "outline"}>
						{integration.isActive ? "Active" : "Inactive"}
					</Badge>
				</div>
			</CardHeader>
		</Card>
	);
}

function IntegrationsSkeleton() {
	return (
		<div className="px-3 pt-19 pb-8 sm:px-5">
			<div className="mx-auto w-full max-w-5xl space-y-6">
				<div className="space-y-2">
					<div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
					<div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
				</div>
				<div className="grid gap-3">
					{Array.from({ length: 3 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
						<div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
					))}
				</div>
			</div>
		</div>
	);
}

function IntegrationsError({ error }: { error: Error }) {
	return (
		<div className="px-3 pt-19 pb-8 sm:px-5">
			<div className="mx-auto w-full max-w-5xl">
				<Card>
					<CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
						<p className="font-medium text-sm">Failed to load integrations</p>
						{import.meta.env.DEV && (
							<pre className="mt-2 max-w-full overflow-auto rounded bg-muted p-3 text-left text-xs">
								{error.message}
							</pre>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
