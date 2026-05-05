import { Search, WrapText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/web/components/ui/button";
import { CopyButton } from "@/web/components/ui/copy-button";
import { Input } from "@/web/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/web/components/ui/tooltip";
import { cn } from "@/web/utils/cn";
import { StructuredValueTree } from "./structured-value-tree";
import type { DataRow } from "./types";
import { safeStringify } from "./value-formatting";

export function ColumnValuesSection({ row }: { row: DataRow }) {
	const [search, setSearch] = useState("");
	const [isWrapped, setIsWrapped] = useState(false);
	const serializedRow = safeStringify(row);

	return (
		<section className="min-h-0 flex-1 px-5 py-4">
			<div className="mb-3 flex items-center justify-between gap-2">
				<div className="relative w-1/2 min-w-[14rem] max-w-[32rem]">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search columns, paths, values"
						className="h-9 border-[color:var(--surface-border)] bg-[color:var(--surface-background)] pl-9 font-mono text-xs"
					/>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className={cn(
									"size-8 border border-transparent text-muted-foreground shadow-none hover:border-[color:var(--surface-border)]",
									isWrapped && "border-primary/40 bg-primary/10 text-primary",
								)}
								onClick={() => setIsWrapped((previous) => !previous)}
								aria-label={isWrapped ? "Disable unwrap" : "Enable unwrap"}
							>
								<WrapText className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent sideOffset={6}>
							{isWrapped ? "Disable unwrap" : "Enable unwrap"}
						</TooltipContent>
					</Tooltip>
					<CopyButton
						aria-label="Copy row JSON"
						onCopy={async () => {
							await navigator.clipboard.writeText(serializedRow);
						}}
						className="size-8 border border-[color:var(--surface-border)] bg-[color:var(--surface-background)]/90 shadow-none"
					/>
				</div>
			</div>
			<StructuredValueTree value={row} search={search} isWrapped={isWrapped} />
		</section>
	);
}
