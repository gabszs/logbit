import { cn } from "@/web/utils/cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn("animate-pulse rounded-lg bg-accent", className)}
			{...props}
		/>
	);
}

export { Skeleton };
