import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useRouterState,
} from "@tanstack/react-router";
import { AppShellSkeleton } from "@/web/components/skeletons/app-skeleton";
import { INTEGRATIONS_NAV_ITEMS } from "@/web/lib/constants";
import { requireAuthenticated } from "@/web/lib/route-guards";
import { cn } from "@/web/utils/cn";
import { IntegrationsError } from "./-components/integrations-error";

export const Route = createFileRoute("/integrations")({
	beforeLoad: async (opts) => {
		await requireAuthenticated({
			authClient: opts.context.authClient,
			location: opts.location,
		});

		const pathname = opts.location.pathname ?? "";
		if (pathname === "/integrations" || pathname === "/integrations/") {
			throw redirect({ to: "/integrations/connections", replace: true });
		}
	},
	errorComponent: IntegrationsError,
	component: IntegrationsLayout,
	pendingComponent: AppShellSkeleton,
});

function IntegrationsLayout() {
	const location = useRouterState({ select: (state) => state.location });
	const activePath = location.pathname ?? "";

	const navigationItems = INTEGRATIONS_NAV_ITEMS.map((item) => ({
		...item,
		isActive:
			activePath === item.to || activePath.startsWith(`${item.to}/`),
	}));

	return (
		<div className="px-3 pt-19 pb-8 sm:px-5">
			<div className="mx-auto w-full max-w-5xl">
				<div className="scrollbar-hide overflow-x-auto">
					<nav
						aria-label="Integrations sections"
						className="flex min-w-max items-end gap-2 border-border/80 border-b"
					>
						{navigationItems.map((item) => (
							<Link
								key={item.to}
								to={item.to}
								preload="intent"
								className={cn(
									"relative -mb-px overflow-hidden rounded-t-lg px-4 py-3 transition-all duration-150",
									item.isActive
										? "bg-card text-foreground shadow-[inset_0_-2px_0_0_var(--color-primary)]"
										: "text-muted-foreground hover:bg-card/70 hover:text-foreground hover:shadow-[0_8px_24px_rgba(0,0,0,0.16)]",
								)}
							>
								<div className="font-semibold text-sm">{item.label}</div>
							</Link>
						))}
					</nav>
				</div>
				<section className="min-w-0 pt-8">
					<Outlet />
				</section>
			</div>
		</div>
	);
}
