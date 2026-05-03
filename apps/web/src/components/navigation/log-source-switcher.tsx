import { queryOptions, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
	Check,
	ChevronsUpDown,
	Database,
	Plus,
	Search,
	SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/web/components/auth-provider";
import { Button } from "@/web/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu";
import { Input } from "@/web/components/ui/input";
import type { LogSourceEntity } from "@/web/lib/sources";
import { getLogSources } from "@/web/lib/sources";
import { cn } from "@/web/utils/cn";

const logSourcesQueryOptions = queryOptions({
	queryKey: ["sources", "logs"],
	queryFn: getLogSources,
});

export function LogSourceSwitcher() {
	const auth = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const { data: sources, error, isPending } = useQuery(logSourcesQueryOptions);
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [isSwitching, setIsSwitching] = useState(false);

	const filteredSources = useMemo(() => {
		const normalizedSearch = search.trim().toLowerCase();
		if (!normalizedSearch) return sources ?? [];
		return (sources ?? []).filter((source) =>
			source.name.toLowerCase().includes(normalizedSearch),
		);
	}, [search, sources]);

	if (!auth.isAuthenticated) return null;

	const currentSourceId = location.pathname.startsWith("/logs")
		? (location.search as { sourceId?: string }).sourceId
		: undefined;

	const selectedSource = sources?.find((item) => item.id === currentSourceId);

	const handleValueChange = async (source: LogSourceEntity) => {
		if (source.id === currentSourceId) return;

		setIsSwitching(true);
		try {
			await navigate({
				to: "/logs",
				search: (prev) => ({ ...prev, sourceId: source.id }),
				replace: true,
			});
			setIsOpen(false);
		} finally {
			setIsSwitching(false);
		}
	};

	const triggerLabel = selectedSource?.name
		? selectedSource.name
		: isPending
			? "Loading source..."
			: error
				? "Sources unavailable"
				: "No source";

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className="h-8 w-[min(16rem,44vw)] min-w-0 max-w-full justify-start gap-2 rounded-md border border-stone-200 bg-[#faf9f6] px-3 text-xs shadow-none hover:bg-accent/60 sm:w-56 sm:text-sm dark:border-stone-800 dark:bg-stone-950"
					disabled={isPending || isSwitching || Boolean(error)}
				>
					<Database className="size-4 shrink-0 text-muted-foreground" />
					<span className="min-w-0 flex-1 truncate text-left">
						{triggerLabel}
					</span>
					<ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				sideOffset={4}
				className="w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-md border-stone-200 bg-[color:var(--surface-background)] p-0 shadow-sm dark:border-stone-800 dark:bg-stone-950"
			>
				<div className="app-surface-divider px-2 py-2">
					<div className="relative">
						<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Find sources..."
							className="h-8 border-0 bg-transparent pr-2 pl-8 text-xs shadow-none focus-visible:ring-0"
						/>
					</div>
				</div>
				<div className="max-h-56 overflow-y-auto py-0.5">
					{filteredSources.map((source) => {
						const isActive = source.id === currentSourceId;

						return (
							<button
								key={source.id}
								type="button"
								onClick={() => void handleValueChange(source)}
								disabled={isSwitching}
								className={cn(
									"flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
									isActive && "bg-accent/40",
								)}
							>
								<div className="flex min-w-0 flex-1 items-center gap-2">
									<Database className="size-4 shrink-0 text-muted-foreground" />
									<div className="min-w-0">
										<div className="truncate">{source.name}</div>
										<div className="truncate text-muted-foreground text-xs">
											{source.config.database ?? "?"}.
											{source.config.table ?? "?"}
										</div>
									</div>
								</div>
								<Check
									className={cn(
										"size-3.5 shrink-0 text-muted-foreground",
										!isActive && "opacity-0",
									)}
								/>
							</button>
						);
					})}
					{!filteredSources.length && (
						<div className="px-3 py-4 text-muted-foreground text-xs">
							No sources found.
						</div>
					)}
				</div>
				<DropdownMenuSeparator className="mx-0 my-0" />
				<div className="p-0.5">
					<Link
						to="/integrations/sources"
						search={{ create: "1" }}
						className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground/70 text-xs transition-colors hover:bg-accent hover:text-foreground"
						onClick={() => setIsOpen(false)}
					>
						<Plus className="size-3.5 shrink-0" />
						<span>Create new source</span>
					</Link>
					<Link
						to="/integrations/sources"
						className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground/70 text-xs transition-colors hover:bg-accent hover:text-foreground"
						onClick={() => setIsOpen(false)}
					>
						<SlidersHorizontal className="size-3.5 shrink-0" />
						<span>Manage sources</span>
					</Link>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
