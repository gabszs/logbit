import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/web/components/theme-provider";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { orpc } from "@/web/lib/orpc";
import { SettingsError } from "./-components/settings-error";
import { SettingsSectionSkeleton } from "./-components/settings-section-skeleton";

const themeOptions = [
	{
		id: "light",
		label: "Light",
		description: "Clean and bright appearance",
		icon: Sun,
	},
	{
		id: "dark",
		label: "Dark",
		description: "Easy on the eyes in low light",
		icon: Moon,
	},
	{
		id: "system",
		label: "System",
		description: "Follows your operating system preference",
		icon: Monitor,
	},
] as const;

export const Route = createFileRoute("/settings/appearance")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(orpc.settings.get.queryOptions());
	},
	component: AppearanceSettings,
	pendingComponent: SettingsSectionSkeleton,
	errorComponent: SettingsError,
});

function AppearanceSettings() {
	const { theme, setTheme } = useTheme();

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Theme</CardTitle>
					<CardDescription>Choose how the app looks for you.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{themeOptions.map((option) => {
						const isActive = theme === option.id;
						const Icon = option.icon;
						return (
							<button
								key={option.id}
								type="button"
								className={`flex w-full cursor-pointer items-center gap-3 rounded-lg p-4 text-left transition ${
									isActive
										? "border border-primary bg-primary/10 text-primary"
										: "border border-transparent bg-muted/40 hover:border-muted hover:bg-muted"
								}`}
								onClick={() => setTheme(option.id)}
							>
								<Icon className="size-5 shrink-0" />
								<div className="flex flex-col gap-0.5">
									<span className="font-medium text-sm">{option.label}</span>
									<span className="text-muted-foreground text-xs">
										{option.description}
									</span>
								</div>
							</button>
						);
					})}
				</CardContent>
			</Card>
		</div>
	);
}
