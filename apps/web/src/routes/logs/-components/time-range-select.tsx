import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/web/components/ui/select";
import {
	LOG_TIME_RANGE_OPTIONS,
	type LogTimeRange,
} from "../-lib/logs-queries";

export function TimeRangeSelect({
	value,
	onValueChange,
}: {
	value: LogTimeRange;
	onValueChange: (value: LogTimeRange) => void;
}) {
	return (
		<Select
			value={value}
			onValueChange={(next) => onValueChange(next as LogTimeRange)}
		>
			<SelectTrigger
				size="sm"
				className="w-full min-w-32 rounded-md border-stone-200 bg-[#faf9f6] px-3 py-0 font-mono text-sm leading-none shadow-none dark:border-stone-800 dark:bg-stone-950"
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{LOG_TIME_RANGE_OPTIONS.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
