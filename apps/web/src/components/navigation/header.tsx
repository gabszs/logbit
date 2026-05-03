import { useRouterState } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useAuth } from "@/web/components/auth-provider";
import { LogSourceSwitcher } from "@/web/components/navigation/log-source-switcher";
import { Button } from "@/web/components/ui/button";
import { useContentSidebar } from "@/web/hooks/use-content-sidebar";
import { useLogsCanvasSidebar } from "@/web/hooks/use-logs-canvas-sidebar";
import { cn } from "@/web/utils/cn";

function usePageTitle() {
	const pathname = useRouterState({
		select: (s) => s.location.pathname,
	});
	if (pathname.startsWith("/logs")) return null;
	if (pathname.startsWith("/settings")) return "Settings";
	if (pathname.startsWith("/integrations")) return "Integrations";
	if (pathname.startsWith("/docs")) return "Documentation";
	if (pathname === "/" || pathname === "") return "Home";
	return null;
}

export default function Header() {
	const pathname = useRouterState({
		select: (s) => s.location.pathname,
	});
	const title = usePageTitle();
	const auth = useAuth();
	const { isExpanded: isSidebarExpanded } = useContentSidebar();
	const {
		isExpanded: isLogsCanvasSidebarExpanded,
		toggle: toggleLogsCanvasSidebar,
	} = useLogsCanvasSidebar();
	const showSidebar = auth.isAuthenticated;
	const logsCanvasSidebarLabel = isLogsCanvasSidebarExpanded
		? "Collapse canvas sidebar"
		: "Expand canvas sidebar";

	return (
		<header
			className={cn(
				"fixed top-0 right-0 z-50 h-13 border-b bg-background/80 backdrop-blur-sm transition-[left] duration-200 ease-linear",
				showSidebar ? (isSidebarExpanded ? "left-48" : "left-12") : "left-0",
			)}
		>
			<nav className="flex h-full items-center gap-4 px-4">
				<div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
					{title && (
						<span className="truncate font-medium text-sm">{title}</span>
					)}
					{auth.isAuthenticated && pathname.startsWith("/logs") && (
						<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
							<div className="flex min-w-0 items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-7 shrink-0"
									aria-label={logsCanvasSidebarLabel}
									title={logsCanvasSidebarLabel}
									onClick={toggleLogsCanvasSidebar}
								>
									{isLogsCanvasSidebarExpanded ? (
										<PanelLeftClose className="size-3.5" />
									) : (
										<PanelLeftOpen className="size-3.5" />
									)}
								</Button>
								<span className="truncate text-muted-foreground">
									Built-in views
								</span>
								<span className="shrink-0 text-muted-foreground">&gt;</span>
								<span className="truncate font-medium text-foreground">
									Log Events
								</span>
								<span className="shrink-0 text-muted-foreground">&gt;</span>
							</div>
							<div className="min-w-0 shrink-0">
								<LogSourceSwitcher />
							</div>
						</div>
					)}
				</div>
				<div className="flex-1" />
			</nav>
		</header>
	);
}
