import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

export type LogsVolumePoint = {
	bucket: string;
	rows: number;
};

export function LogsVolumeChart({ points }: { points: LogsVolumePoint[] }) {
	return (
		<section className="space-y-3">
			<div className="flex items-center gap-2">
				<div className="h-px flex-1 bg-border/70" />
				<h2 className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
					Volumetry
				</h2>
				<div className="h-px flex-1 bg-border/70" />
			</div>
			<div className="h-64">
				{points.length === 0 ? (
					<div className="flex h-full items-center justify-center rounded-md border border-stone-200 border-dashed bg-[#faf9f6] text-muted-foreground text-sm dark:border-stone-800 dark:bg-stone-950">
						Run a query to see log volume over time.
					</div>
				) : (
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart
							data={points}
							margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
						>
							<CartesianGrid strokeDasharray="3 3" vertical={false} />
							<XAxis
								dataKey="bucket"
								tickLine={false}
								axisLine={false}
								minTickGap={24}
							/>
							<YAxis tickLine={false} axisLine={false} width={48} />
							<Tooltip
								contentStyle={{
									borderRadius: "12px",
									border: "1px solid var(--border)",
									background: "var(--background)",
								}}
							/>
							<Area
								type="monotone"
								dataKey="rows"
								stroke="var(--color-primary)"
								fill="var(--color-primary)"
								fillOpacity={0.14}
								strokeWidth={2}
							/>
						</AreaChart>
					</ResponsiveContainer>
				)}
			</div>
		</section>
	);
}
