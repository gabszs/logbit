import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useRouterState,
} from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/web/components/auth-provider";
import { AppShellSkeleton } from "@/web/components/skeletons/app-skeleton";
import { SETTINGS_NAV_ITEMS } from "@/web/lib/constants";
import { requireAuthenticated } from "@/web/lib/route-guards";
import { cn } from "@/web/utils/cn";
import { SettingsError } from "./-components/settings-error";

export const Route = createFileRoute("/settings")({
	beforeLoad: async (opts) => {
		await requireAuthenticated({
			authClient: opts.context.authClient,
			location: opts.location,
		});

		const pathname = opts.location.pathname ?? "";
		if (pathname === "/settings" || pathname === "/settings/") {
			throw redirect({ to: "/settings/profile", replace: true });
		}
	},
	errorComponent: SettingsError,
	component: SettingsLayout,
	pendingComponent: AppShellSkeleton,
});

function SettingsLayout() {
	const auth = useAuth();
	const location = useRouterState({ select: (state) => state.location });
	const activePath = location.pathname ?? "";
	const isPlatformAdmin = auth.session?.user?.role === "admin";

	const navigationItems = useMemo(() => {
		const visibleItems = SETTINGS_NAV_ITEMS.filter((item) => {
			if (item.to === "/settings/admin") {
				return isPlatformAdmin;
			}

			return true;
		});

		return visibleItems.map((item) => {
			const isActive =
				activePath === item.to || activePath.startsWith(`${item.to}/`);
			return { ...item, isActive };
		});
	}, [activePath, isPlatformAdmin]);

	return (
		<div className="px-3 pt-19 pb-8 sm:px-5">
			<div className="mx-auto w-full max-w-5xl">
				<div className="scrollbar-hide overflow-x-auto">
					<nav
						aria-label="Settings sections"
						className="flex min-w-max items-end gap-2 border-stone-200 border-b dark:border-stone-800"
					>
						{navigationItems.map((item) => (
							<Link
								key={item.to}
								to={item.to}
								preload="intent"
								className={cn(
									"relative overflow-hidden rounded-t-lg border-b-2 px-4 py-3 transition-all duration-150",
									item.isActive
										? "border-primary bg-[color:var(--surface-background)] text-foreground"
										: "border-transparent text-muted-foreground hover:bg-[color:var(--surface-background)]/60 hover:text-foreground",
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
