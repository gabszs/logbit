import { Skeleton } from "@/web/components/ui/skeleton";

export function LogsSkeleton() {
	return (
		<div className="flex flex-1 flex-col px-4 pt-12 pb-10 sm:px-6 lg:px-8">
			<div className="pt-4 pb-2.5">
				<div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-end gap-4">
					<Skeleton className="h-10 w-36 rounded-xl" />
					<Skeleton className="h-[18rem] flex-1 rounded-2xl" />
				</div>
			</div>

			<div className="mx-auto grid w-full max-w-[1600px] gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
				<Skeleton className="logs-surface min-h-[520px]" />

				<div className="logs-surface backdrop-blur-sm">
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
	);
}
