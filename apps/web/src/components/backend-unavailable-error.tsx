import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/web/components/ui/button";
import { getErrorDisplayMessage } from "@/web/lib/backend-error";

interface BackendUnavailableErrorProps {
	error: unknown;
}

export function BackendUnavailableError({
	error,
}: BackendUnavailableErrorProps) {
	return (
		<div className="fixed inset-0 z-[100] flex items-start justify-center bg-background px-4 pt-24 sm:pt-[18vh]">
			<div className="app-surface w-full max-w-md space-y-6 p-6">
				<div className="space-y-2">
					<div className="flex items-center justify-center gap-3 text-destructive">
						<AlertCircle className="size-6 shrink-0" />
						<h1 className="font-semibold text-2xl text-foreground">
							Server is not responding
						</h1>
					</div>
					<p className="text-muted-foreground text-sm">
						The app could not reach the backend. Check that the server is
						running, then reload the page.
					</p>
				</div>

				{import.meta.env.DEV && (
					<div className="app-surface-border rounded-md bg-muted p-3 text-left">
						<p className="break-all font-mono text-destructive text-xs">
							{getErrorDisplayMessage(error)}
						</p>
					</div>
				)}

				<Button
					onClick={() => window.location.reload()}
					variant="default"
					className="mx-auto flex gap-2"
				>
					<RefreshCw className="size-4" />
					Reload page
				</Button>
			</div>
		</div>
	);
}
