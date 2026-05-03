import { Skeleton } from "@/web/components/ui/skeleton";

export function LogsSkeleton() {
	return (
		<div className="flex flex-1 flex-col px-4 pt-12 pb-10 sm:px-6 lg:px-8">
			<div className="-mx-4 border-border/70 border-b pt-4 pb-2.5 sm:-mx-6 lg:-mx-8">
				<div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-end gap-4 px-4 sm:px-6 lg:px-8">
					<Skeleton className="h-10 w-36 rounded-xl" />
					<Skeleton className="h-[18rem] flex-1 rounded-2xl" />
				</div>
			</div>

			<div className="mx-auto grid w-full max-w-[1600px] gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
				<Skeleton className="min-h-[520px] rounded-md border border-stone-200 bg-[#faf9f6] shadow-sm dark:border-stone-800 dark:bg-stone-950" />

				<div className="overflow-hidden rounded-3xl border border-border/70 bg-card/80 shadow-sm backdrop-blur-sm">
					<div className="space-y-5 p-5 lg:p-6">
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-12 w-3/4 rounded-xl" />
						<div className="flex flex-wrap gap-6 border-border/70 border-t pt-4">
							<Skeleton className="h-10 w-28" />
							<Skeleton className="h-10 w-28" />
							<Skeleton className="h-10 w-28" />
						</div>
					</div>
					<div className="border-border/70 border-t px-5 py-5 lg:px-6">
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
