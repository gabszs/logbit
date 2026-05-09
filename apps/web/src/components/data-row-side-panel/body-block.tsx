import { CopyButton } from "@/web/components/ui/copy-button";
import type { ResolvedRowFields } from "./types";
import { toDisplayText } from "./value-formatting";

export function BodyBlock({ fields }: { fields: ResolvedRowFields }) {
	const body = toDisplayText(fields.body);
	const label = fields.bodyLabel ?? "Body";
	const displayLabel = label === "SpanName" ? "SPAN-NAME" : label;

	return (
		<section className="border-[color:var(--surface-border)] border-b px-5 py-4">
			<div className="mb-2 flex items-center gap-3">
				<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
					{displayLabel}
				</h3>
			</div>
			<div className="relative max-h-[18rem] overflow-auto rounded-md border border-[color:var(--surface-border)] bg-[#faf9f6]/70 px-4 py-3 pr-14 font-mono text-[13px] text-foreground leading-6 dark:bg-stone-950/70">
				<CopyButton
					aria-label="Copy body"
					onCopy={async () => {
						await navigator.clipboard.writeText(body);
					}}
					className="absolute top-2 right-2 z-10 size-8 border border-[color:var(--surface-border)] bg-[color:var(--surface-background)]/90 shadow-none backdrop-blur-sm"
				/>
				<pre className="whitespace-pre-wrap break-words">{body}</pre>
			</div>
		</section>
	);
}
