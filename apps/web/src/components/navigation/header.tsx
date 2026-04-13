import { useRouterState } from "@tanstack/react-router";

import { useAuth } from "@/web/components/auth-provider";
import { OrganizationSwitcher } from "@/web/components/navigation/organization-switcher";
import { useContentSidebar } from "@/web/hooks/use-content-sidebar";
import { cn } from "@/web/utils/cn";

function usePageTitle() {
	const pathname = useRouterState({
		select: (s) => s.location.pathname,
	});
	if (pathname.startsWith("/settings")) return "Settings";
	if (pathname.startsWith("/docs")) return "Documentation";
	if (pathname === "/" || pathname === "") return "Home";
	return null;
}

export default function Header() {
	const title = usePageTitle();
	const auth = useAuth();
	const { isExpanded: isSidebarExpanded } = useContentSidebar();
	const showSidebar = auth.isAuthenticated;

	return (
		<header
			className={cn(
				"fixed top-0 right-0 z-50 h-13 border-b bg-background/80 backdrop-blur-sm transition-[left] duration-200 ease-linear",
				showSidebar ? (isSidebarExpanded ? "left-48" : "left-12") : "left-0",
			)}
		>
			<nav className="flex h-full items-center gap-4 px-4">
				<div className="flex min-w-0 items-center gap-5">
					{title && (
						<span className="truncate font-medium text-sm">{title}</span>
					)}
					{auth.isAuthenticated && title && (
						<span className="px-1 text-muted-foreground">|</span>
					)}
					{auth.isAuthenticated && (
						<div className="min-w-0 shrink-0">
							<OrganizationSwitcher />
						</div>
					)}
				</div>
				<div className="flex-1" />
			</nav>
		</header>
	);
}
