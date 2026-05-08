import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { BackendUnavailableError } from "@/web/components/backend-unavailable-error";
import { Button } from "@/web/components/ui/button";
import { isBackendUnavailableError } from "@/web/lib/backend-error";

export function IntegrationsError({ error, reset }: ErrorComponentProps) {
	const router = useRouter();

	if (isBackendUnavailableError(error)) {
		return <BackendUnavailableError error={error} />;
	}

	return (
		<div className="flex h-full items-center justify-center p-4">
			<div className="app-surface w-full max-w-md space-y-6 p-6 text-center">
				<div className="flex justify-center">
					<div className="rounded-full bg-destructive/10 p-3">
						<AlertCircle className="size-10 text-destructive" />
					</div>
				</div>

				<div className="space-y-2">
					<h2 className="font-semibold text-xl">Failed to load integrations</h2>
					<p className="text-muted-foreground text-sm">
						We couldn't load the integrations. Please try again or contact
						support if the problem persists.
					</p>
				</div>

				{import.meta.env.DEV && error && (
					<div className="app-surface-border rounded-md bg-muted p-3 text-left">
						<p className="break-all font-mono text-destructive text-xs">
							{error.message || String(error)}
						</p>
					</div>
				)}

				<div className="flex flex-col gap-2 sm:flex-row">
					<Button onClick={() => reset()} variant="default" className="gap-2">
						<RefreshCw className="size-4" />
						Try Again
					</Button>
					<Button
						onClick={() => router.navigate({ to: "/" })}
						variant="outline"
						className="gap-2"
					>
						<ArrowLeft className="size-4" />
						Back to Home
					</Button>
				</div>
			</div>
		</div>
	);
}
