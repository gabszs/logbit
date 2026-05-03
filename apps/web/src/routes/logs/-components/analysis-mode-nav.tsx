import { Activity } from "lucide-react";
import { cn } from "@/web/utils/cn";

export function AnalysisModeNav() {
	return (
		<div className="app-surface-divider flex items-end gap-2">
			<button
				type="button"
				className={cn(
					"relative -mb-px inline-flex items-center gap-2 rounded-t-xl border border-primary/20 border-b-0 bg-[color:var(--surface-background)] px-4 py-3 font-semibold text-foreground text-sm shadow-[inset_0_-2px_0_0_var(--color-primary)]",
				)}
			>
				<Activity className="size-4 text-primary" />
				Results Table
			</button>
		</div>
	);
}
