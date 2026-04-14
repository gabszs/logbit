import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Loader2, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/web/components/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "@/web/components/ui/alert";
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
import { authClient } from "@/web/lib/auth-client";
import { OrganizationFormDialog } from "./-components/organizations/organization-form-dialog";
import { OrganizationRow } from "./-components/organizations/organization-row";
import type {
	OrganizationListItem,
	OrganizationListRow,
} from "./-components/organizations/types";
import { SettingsError } from "./-components/settings-error";
import { SettingsSectionSkeleton } from "./-components/settings-section-skeleton";

const organizationsQueryOptions = queryOptions({
	queryKey: ["better-auth", "organizations", "list"],
	retry: false,
	queryFn: async () => {
		const { data, error } = await authClient.organization.list();

		if (error) {
			throw new Error(error.message || "Failed to load organizations");
		}

		return data ?? [];
	},
});

export const Route = createFileRoute("/settings/organizations")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(organizationsQueryOptions);
	},
	component: OrganizationsSettingsPage,
	pendingComponent: SettingsSectionSkeleton,
	errorComponent: SettingsError,
});

function inferMembership(organization: OrganizationListItem) {
	if (organization.memberId) return true;
	if (organization.role) return true;
	if (Array.isArray(organization.members))
		return organization.members.length > 0;
	return false;
}

function OrganizationsSettingsPage() {
	const auth = useAuth();
	const queryClient = useQueryClient();
	const [isCreateOpen, setIsCreateOpen] = useState(false);

	const activeOrganizationId = auth.session?.session?.activeOrganizationId;

	const organizationsQuery = useQuery(organizationsQueryOptions);

	const organizations: OrganizationListRow[] = (
		organizationsQuery.data ?? []
	).map((organization) => ({
		...organization,
		isMember: inferMembership(organization),
	}));

	const refreshOrganizations = async () => {
		await queryClient.invalidateQueries({
			queryKey: ["better-auth", "organizations", "list"],
		});
	};

	return (
		<>
			<Card>
				<CardHeader className="relative gap-3 pr-20">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Building2 className="size-5" />
							<CardTitle>Organizations</CardTitle>
						</div>
						<CardDescription>Manage your organizations.</CardDescription>
					</div>

					<div className="absolute top-0 right-6 flex items-center gap-2">
						<Button
							type="button"
							size="icon"
							variant="outline"
							onClick={() => {
								void refreshOrganizations();
							}}
							className="size-8 rounded-md"
							aria-label="Refresh organizations"
						>
							<RefreshCw className="size-3.5" />
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setIsCreateOpen(true)}
							className="h-8 rounded-md px-3 text-xs"
						>
							<Plus className="size-3.5" />
							Create organization
						</Button>
					</div>
				</CardHeader>
				<Separator />

				<CardContent className="space-y-4">
					<div className="flex flex-wrap gap-2">
						<Badge variant="outline">
							{organizations.length} organization
							{organizations.length === 1 ? "" : "s"}
						</Badge>
					</div>

					{organizationsQuery.isPending ? (
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<Loader2 className="size-4 animate-spin" />
							Loading organizations...
						</div>
					) : organizationsQuery.error ? (
						<Alert variant="destructive">
							<AlertTitle>Failed to load organizations</AlertTitle>
							<AlertDescription>
								{organizationsQuery.error.message}
							</AlertDescription>
						</Alert>
					) : organizations.length === 0 ? (
						<div className="rounded-xl border border-border/70 border-dashed bg-background/40 px-4 py-8 text-center">
							<p className="font-medium text-sm">No organizations found.</p>
							<p className="mt-2 text-muted-foreground text-sm">
								Create your first organization to start managing tenant-level
								settings here.
							</p>
						</div>
					) : (
						<div className="overflow-hidden rounded-xl border border-border/70 bg-card/70">
							{organizations.map((organization, index) => (
								<div key={organization.id}>
									<OrganizationRow
										organization={organization}
										activeOrganizationId={activeOrganizationId}
										onRefresh={refreshOrganizations}
									/>
									{index < organizations.length - 1 ? (
										<Separator className="bg-border/70" />
									) : null}
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<OrganizationFormDialog
				mode="create"
				open={isCreateOpen}
				onOpenChange={setIsCreateOpen}
				onSuccess={refreshOrganizations}
			/>
		</>
	);
}
