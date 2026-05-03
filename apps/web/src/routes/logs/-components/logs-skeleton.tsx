import { Skeleton } from "@/web/components/ui/skeleton";
import { useContentSidebar } from "@/web/hooks/use-content-sidebar";

export function LogsSkeleton() {
	const { isExpanded: isAppSidebarExpanded } = useContentSidebar();

	return (
		<div className="flex flex-1 flex-col px-4 pt-20 pb-10 sm:px-6 lg:px-8 xl:px-0 xl:pt-13">
			<div className="w-full xl:pl-[280px]">
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

				<div className="flex min-h-0 w-full flex-col gap-5">
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

					<div className="px-0 xl:px-5">
						<div className="logs-surface mx-auto min-h-0 w-full max-w-[1400px] flex-1 overflow-hidden backdrop-blur-sm">
							<div className="space-y-5 p-5 lg:p-6">
								<Skeleton className="h-4 w-28" />
								<Skeleton className="h-12 w-3/4 rounded-xl" />
								<div className="logs-surface-divider grid gap-2 pt-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(8rem,0.75fr)_auto]">
									<Skeleton className="h-10 w-28" />
									<Skeleton className="h-10 w-full xl:col-span-2" />
								</div>
							</div>
							<div className="logs-surface-divider px-5 py-5 lg:px-6">
								<Skeleton className="h-8 w-48" />
								<div className="mt-5 space-y-5">
									<Skeleton className="h-64 rounded-2xl" />
									<Skeleton className="h-[28rem] rounded-2xl" />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
