import type { ErrorComponentProps } from "@tanstack/react-router";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpenText, House, Settings2, ShieldCheck } from "lucide-react";
import { BackendUnavailableError } from "@/web/components/backend-unavailable-error";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { Skeleton } from "@/web/components/ui/skeleton";
import { useProfile } from "@/web/hooks/use-profile";
import { isBackendUnavailableError } from "@/web/lib/backend-error";
import { orpc } from "@/web/lib/orpc";
import { requireAuthenticated } from "@/web/lib/route-guards";

export const Route = createFileRoute("/")({
	beforeLoad: async (opts) => {
		await requireAuthenticated({
			authClient: opts.context.authClient,
			location: opts.location,
		});
	},
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(orpc.profile.get.queryOptions());
	},
	component: HomeRoute,
	pendingComponent: HomeSkeleton,
	errorComponent: HomeError,
});

function HomeRoute() {
	const profile = useProfile();
	const user = profile.data;
	const firstName =
		user?.name?.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || "there";

	return (
		<div className="flex flex-1 items-start px-4 pt-20 pb-10 sm:px-6 lg:px-10">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
				<section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
					<Card>
						<CardHeader className="space-y-4">
							<Badge
								variant="outline"
								className="w-fit border-primary/40 bg-primary/5 text-primary"
							>
								Protected workspace
							</Badge>
							<div className="space-y-2">
								<CardTitle className="text-3xl tracking-tight sm:text-4xl">
									Welcome back, {firstName}.
								</CardTitle>
								<CardDescription className="max-w-2xl text-base leading-7">
									Your authenticated home now resolves access before render,
									prefetches profile state, and keeps the first screen stable
									while the rest of the app loads around it.
								</CardDescription>
							</div>
						</CardHeader>
						<CardContent className="flex flex-wrap gap-3">
							<Button asChild>
								<Link to="/settings/profile" preload="intent">
									<Settings2 className="size-4" />
									Open settings
								</Link>
							</Button>
							<Button asChild variant="outline">
								<Link to="/docs" preload="intent">
									<BookOpenText className="size-4" />
									Read docs
								</Link>
							</Button>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-lg">Session summary</CardTitle>
							<CardDescription>
								Core account details already live in the TanStack Query cache.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-1">
								<p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
									Account
								</p>
								<p className="font-medium text-sm">
									{user?.email ?? "Signed in"}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
									Display name
								</p>
								<p className="font-medium text-sm">
									{user?.name || "Not set yet"}
								</p>
							</div>
						</CardContent>
					</Card>
				</section>

				<section className="grid gap-4 md:grid-cols-3">
					<QuickActionCard
						icon={House}
						title="Stable route UX"
						description="Protected screens resolve auth before render so navigation never flashes the wrong state."
					/>
					<QuickActionCard
						icon={ShieldCheck}
						title="Session-aware data"
						description="Home, settings, and auth now share a predictable loading model driven by route loaders."
					/>
					<QuickActionCard
						icon={BookOpenText}
						title="Typed requests"
						description="Better Auth, oRPC, and Hono RPC each keep their own responsibility without raw fetch calls in pages."
					/>
				</section>
			</div>
		</div>
	);
}

function QuickActionCard({
	icon: Icon,
	title,
	description,
}: {
	icon: typeof House;
	title: string;
	description: string;
}) {
	return (
		<Card>
			<CardHeader className="space-y-3">
				<div className="flex size-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
					<Icon className="size-4" />
				</div>
				<div className="space-y-2">
					<CardTitle className="text-lg">{title}</CardTitle>
					<CardDescription className="text-sm leading-6">
						{description}
					</CardDescription>
				</div>
			</CardHeader>
		</Card>
	);
}

function HomeSkeleton() {
	return (
		<div className="flex flex-1 items-start px-4 pt-20 pb-10 sm:px-6 lg:px-10">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
				<div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
					<Card>
						<CardHeader className="space-y-4">
							<Skeleton className="h-6 w-36" />
							<div className="space-y-3">
								<Skeleton className="h-10 w-72 max-w-full" />
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-4/5" />
							</div>
						</CardHeader>
						<CardContent className="flex gap-3">
							<Skeleton className="h-10 w-36" />
							<Skeleton className="h-10 w-32" />
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="space-y-3">
							<Skeleton className="h-6 w-40" />
							<Skeleton className="h-4 w-56 max-w-full" />
						</CardHeader>
						<CardContent className="space-y-4">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
						</CardContent>
					</Card>
				</div>
				<div className="grid gap-4 md:grid-cols-3">
					{["stable", "session", "requests"].map((section) => (
						<Card key={section}>
							<CardHeader className="space-y-4">
								<Skeleton className="size-10 rounded-full" />
								<div className="space-y-3">
									<Skeleton className="h-6 w-40 max-w-full" />
									<Skeleton className="h-4 w-full" />
									<Skeleton className="h-4 w-4/5" />
								</div>
							</CardHeader>
						</Card>
					))}
				</div>
			</div>
		</div>
	);
}

function HomeError({ error, reset }: ErrorComponentProps) {
	if (isBackendUnavailableError(error)) {
		return <BackendUnavailableError error={error} />;
	}

	return (
		<div className="flex flex-1 items-center justify-center px-4 pt-20">
			<Card className="w-full max-w-lg">
				<CardHeader className="space-y-3 text-center">
					<Badge
						variant="outline"
						className="mx-auto border-destructive/30 bg-destructive/5 text-destructive"
					>
						Home unavailable
					</Badge>
					<CardTitle className="text-2xl">We couldn't load your home</CardTitle>
					<CardDescription className="text-base leading-7">
						Try again to refresh your session and restore the first screen of
						the app.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{import.meta.env.DEV && (
						<pre className="overflow-x-auto rounded-lg bg-muted p-3 text-destructive text-xs">
							{error.message}
						</pre>
					)}
					<div className="flex flex-col gap-3 sm:flex-row">
						<Button onClick={() => reset()} className="flex-1">
							Try again
						</Button>
						<Button asChild variant="outline" className="flex-1">
							<Link to="/settings/profile">Open settings</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
