import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/web/components/auth-provider";
import { Button } from "@/web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu";
import { Input } from "@/web/components/ui/input";
import { authClient } from "@/web/lib/auth-client";
import { orpc } from "@/web/lib/orpc";
import { cn } from "@/web/utils/cn";

interface OrganizationSummary {
  id: string;
  name: string;
}

interface BetterAuthErrorLike {
  message?: string;
}

interface OrganizationAuthClient {
  useListOrganizations: () => {
    data: OrganizationSummary[] | null;
    error: BetterAuthErrorLike | null;
    isPending: boolean;
  };
  organization: {
    setActive: (input: {
      organizationId: string;
    }) => Promise<{ error: BetterAuthErrorLike | null }>;
  };
}

export function OrganizationSwitcher() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const hasSyncedRef = useRef(false);

  const organizationAuthClient = authClient as typeof authClient &
    OrganizationAuthClient;

  const {
    data: organizations,
    error: organizationsError,
    isPending: isOrganizationsPending,
  } = organizationAuthClient.useListOrganizations();

  const { data: settings } = useQuery({
    ...orpc.settings.get.queryOptions(),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled: auth.isAuthenticated,
  });

  const updateSettings = useMutation(orpc.settings.update.mutationOptions());

  const activeOrganizationId = (
    auth.session as {
      session?: { activeOrganizationId?: string | null };
    } | null
  )?.session?.activeOrganizationId;

  const selectedOrganizationId =
    activeOrganizationId &&
    organizations?.some(
      (organization) => organization.id === activeOrganizationId,
    )
      ? activeOrganizationId
      : undefined;

  const selectedOrganization = organizations?.find(
    (organization) => organization.id === selectedOrganizationId,
  );

  // On first load, sync active org from saved settings
  useEffect(() => {
    if (hasSyncedRef.current) return;
    if (!settings?.organizationId) return;
    if (!organizations) return;

    hasSyncedRef.current = true;

    if (settings.organizationId === activeOrganizationId) return;

    const orgExists = organizations.some(
      (o) => o.id === settings.organizationId,
    );
    if (!orgExists) return;

    organizationAuthClient.organization
      .setActive({ organizationId: settings.organizationId })
      .then(({ error }) => {
        if (!error) queryClient.invalidateQueries();
      })
      .catch(console.error);
  }, [settings?.organizationId, organizations]);

  const filteredOrganizations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return organizations ?? [];
    return (organizations ?? []).filter((organization) =>
      organization.name.toLowerCase().includes(normalizedSearch),
    );
  }, [organizations, search]);

  if (!auth.isAuthenticated) return null;

  const handleValueChange = async (nextOrganizationId: string) => {
    if (!nextOrganizationId || nextOrganizationId === selectedOrganizationId) {
      return;
    }

    setIsSwitching(true);

    const nextOrganization = organizations?.find(
      (organization) => organization.id === nextOrganizationId,
    );

    try {
      const { error } = await organizationAuthClient.organization.setActive({
        organizationId: nextOrganizationId,
      });

      if (error) {
        toast.error(error.message || "Failed to switch organization");
        return;
      }

      await updateSettings.mutateAsync({ organizationId: nextOrganizationId });

      await queryClient.invalidateQueries();
      setIsOpen(false);
      toast.success(
        nextOrganization
          ? `Switched to ${nextOrganization.name}`
          : "Organization updated",
      );
    } catch (error) {
      console.error("Failed to switch active organization", error);
      toast.error("Failed to switch organization");
    } finally {
      setIsSwitching(false);
    }
  };

  const triggerLabel = selectedOrganization?.name
    ? selectedOrganization.name
    : isOrganizationsPending
      ? "Loading organization..."
      : organizationsError
        ? "Organizations unavailable"
        : "No organization";

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-[min(16rem,44vw)] min-w-0 max-w-full justify-between gap-2 rounded-lg border border-border/70 bg-card/60 px-3 text-xs shadow-none hover:bg-accent/60 sm:w-56 sm:text-sm"
          disabled={
            isOrganizationsPending || isSwitching || Boolean(organizationsError)
          }
        >
          <span className="min-w-0 truncate text-left">{triggerLabel}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-xl border-border bg-popover p-0"
      >
        <div className="border-border border-b px-2 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find organization..."
              className="h-8 border-0 bg-transparent pr-2 pl-8 text-xs shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto py-0.5">
          {filteredOrganizations.map((organization) => {
            const isActive = organization.id === selectedOrganizationId;

            return (
              <button
                key={organization.id}
                type="button"
                onClick={() => handleValueChange(organization.id)}
                disabled={isSwitching}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
                  isActive && "bg-accent/40",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {organization.name}
                </span>
                <Check
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground",
                    !isActive && "opacity-0",
                  )}
                />
              </button>
            );
          })}
          {!filteredOrganizations.length && (
            <div className="px-3 py-4 text-muted-foreground text-xs">
              No organizations found.
            </div>
          )}
        </div>
        <DropdownMenuSeparator className="mx-0 my-0" />
        <div className="p-0.5">
          <button
            type="button"
            disabled
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-foreground/70 opacity-60"
          >
            All Organizations
          </button>
          <button
            type="button"
            disabled
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-foreground/70 opacity-60"
          >
            <Plus className="size-3.5 shrink-0" />
            <span>New organization</span>
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
