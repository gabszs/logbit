import { Skeleton } from "@/web/components/ui/skeleton";

export function IntegrationsSectionSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-3">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-64 max-w-full" />
			</div>
			<div className="rounded-xl border bg-card">
				<div className="space-y-4 p-6">
					<Skeleton className="h-5 w-32" />
					<Skeleton className="h-4 w-72 max-w-full" />
					<div className="space-y-3 pt-2">
						<Skeleton className="h-18 w-full" />
						<Skeleton className="h-18 w-full" />
						<Skeleton className="h-18 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
