import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { BackendUnavailableError } from "@/web/components/backend-unavailable-error";
import { Button } from "@/web/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { isBackendUnavailableError } from "@/web/lib/backend-error";

export function LogsError({ error, reset }: ErrorComponentProps) {
	if (isBackendUnavailableError(error)) {
		return <BackendUnavailableError error={error} />;
	}

	return (
		<div className="flex flex-1 items-start justify-center px-4 pt-20 pb-10">
			<Card className="w-full max-w-2xl border-stone-200 bg-[#faf9f6] shadow-sm backdrop-blur-sm dark:border-stone-800 dark:bg-stone-950">
				<CardHeader className="space-y-3">
					<div className="flex items-center gap-2 text-destructive">
						<AlertTriangle className="size-5" />
						<CardTitle className="text-2xl">
							Logs explorer unavailable
						</CardTitle>
					</div>
					<CardDescription className="text-base leading-7">
						The log explorer could not load its data. Try again or go back to
						the integrations area to verify the source configuration.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="rounded-md border border-stone-200 bg-[#faf9f6] p-4 font-mono text-muted-foreground text-sm shadow-sm dark:border-stone-800 dark:bg-stone-950">
						{error instanceof Error ? error.message : "Unknown error"}
					</div>
					<div className="flex flex-wrap gap-3">
						<Button onClick={reset}>
							<RotateCcw className="size-4" />
							Try again
						</Button>
						<Button asChild variant="outline">
							<Link to="/integrations/sources">
								<ArrowLeft className="size-4" />
								Open sources
							</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
