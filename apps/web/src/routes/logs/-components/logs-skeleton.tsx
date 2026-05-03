import { Skeleton } from "@/web/components/ui/skeleton";
import { useContentSidebar } from "@/web/hooks/use-content-sidebar";

export function LogsSkeleton() {
	const { isExpanded: isAppSidebarExpanded } = useContentSidebar();

	return (
		<div className="flex min-h-0 flex-1 flex-col bg-[color:var(--surface-background)] px-4 pt-20 pb-0 sm:px-6 lg:px-8 xl:px-0 xl:pt-13">
			<div className="flex min-h-0 w-full flex-1 flex-col xl:pl-[280px]">
				<div className="mb-4 flex items-center justify-between rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-background)]/92 px-4 py-3 shadow-[var(--surface-shadow)] xl:hidden">
					<div className="space-y-2">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-5 w-28" />
					</div>
					<Skeleton className="h-10 w-28 rounded-xl" />
				</div>

				<div
					className={`fixed top-13 bottom-0 z-20 hidden w-[280px] flex-col border-[color:var(--surface-border)] border-r bg-[color:var(--surface-background)] shadow-[12px_0_32px_rgba(0,0,0,0.08)] xl:flex dark:shadow-[12px_0_32px_rgba(0,0,0,0.24)] ${isAppSidebarExpanded ? "left-48" : "left-12"}`}
				>
					<div className="flex-1 space-y-3 px-3.5 py-3.5">
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-9 w-full rounded-md" />
						<Skeleton className="h-9 w-full rounded-md" />
						<Skeleton className="h-9 w-full rounded-md" />
						<div className="logs-surface-divider pt-3">
							<Skeleton className="h-3 w-24" />
							<div className="mt-3 space-y-2">
								<Skeleton className="h-8 w-full rounded-md" />
								<Skeleton className="h-8 w-full rounded-md" />
								<Skeleton className="h-8 w-full rounded-md" />
							</div>
						</div>
					</div>
				</div>

				<div className="flex min-h-0 w-full flex-1 flex-col gap-0 bg-[color:var(--surface-background)]">
					<div className="space-y-3 border-[color:var(--surface-border)] border-b bg-[color:var(--surface-background)]/92 px-4 py-4 sm:px-5 lg:px-6">
						<div className="grid gap-2 xl:grid-cols-[minmax(0,2.2fr)_minmax(18rem,0.9fr)]">
							<Skeleton className="h-10 w-full rounded-lg" />
							<Skeleton className="h-10 w-full rounded-lg" />
						</div>
						<div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)_auto]">
							<Skeleton className="h-10 w-full rounded-lg" />
							<Skeleton className="h-10 w-full rounded-lg" />
							<Skeleton className="h-10 w-20 rounded-lg xl:justify-self-end" />
						</div>
					</div>

					<div className="flex min-h-0 w-full flex-1 flex-col bg-[color:var(--surface-background)]">
						<div className="flex items-center gap-2 border-[color:var(--surface-border)] border-b px-4 py-3 sm:px-6">
							<Skeleton className="h-3 w-24" />
							<div className="h-px flex-1 bg-[color:var(--surface-border)]" />
							<Skeleton className="h-3 w-14" />
						</div>
						<div className="space-y-0">
							{Array.from({ length: 12 }).map((_, index) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton rows
									key={index}
									className="grid grid-cols-[minmax(8rem,0.7fr)_minmax(8rem,0.5fr)_minmax(8rem,0.45fr)_minmax(18rem,1.6fr)] gap-4 border-[color:var(--surface-border)] border-b px-4 py-3 sm:px-6"
								>
									<Skeleton className="h-4 w-full" />
									<Skeleton className="h-4 w-2/3" />
									<Skeleton className="h-4 w-1/2" />
									<Skeleton className="h-4 w-full" />
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
