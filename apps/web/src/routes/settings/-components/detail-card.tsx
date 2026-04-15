import { toast } from "sonner";
import { CopyButton } from "@/web/components/ui/copy-button";
import { cn } from "@/web/utils/cn";

export function DetailCard({
	label,
	value,
	copyValue,
	className,
	preformatted = false,
}: {
	label: string;
	value: string;
	copyValue?: string;
	className?: string;
	preformatted?: boolean;
}) {
	return (
		<div
			className={cn(
				"group relative rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5",
				className,
			)}
		>
			<p className="pr-8 text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
				{label}
			</p>
			{preformatted ? (
				<pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5">
					{value}
				</pre>
			) : (
				<p className="mt-1 break-words text-sm leading-5">{value}</p>
			)}
			<CopyButton
				onCopy={async () => {
					await navigator.clipboard.writeText(copyValue ?? value);
					toast.success(`${label} copied`);
				}}
				aria-label={`Copy ${label}`}
				className="absolute top-1/2 right-2 size-7 -translate-y-1/2 opacity-0 shadow-none transition-opacity hover:shadow-sm group-hover:opacity-100"
			/>
		</div>
	);
}
