import { type AuthContextValue, useAuth } from "@/web/components/auth-provider";
import { BackgroundLayout } from "@/web/components/background";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { AppSidebar } from "@/web/components/navigation/app-sidebar";
import Header from "@/web/components/navigation/header";
import { NotFound } from "@/web/components/not-found";
import { ThemeProvider } from "@/web/components/theme-provider";
import { Toaster } from "@/web/components/ui/sonner";
import { useContentSidebar } from "@/web/hooks/use-content-sidebar";
import "@/web/index.css";
import type { authClient } from "@/web/lib/auth-client";
import type { orpc } from "@/web/lib/orpc";
import { cn } from "@/web/utils/cn";
import type { QueryClient } from "@tanstack/react-query";
import {
    createRootRouteWithContext,
    Outlet,
    useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";

export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
	authClient: typeof authClient;
	auth: AuthContextValue;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	notFoundComponent: NotFound,
	errorComponent: ErrorBoundary,
});

function RootComponent() {
	const router = useRouterState();
	const auth = useAuth();
	const { isExpanded: isSidebarExpanded } = useContentSidebar();
	const isAuthenticated = auth.isAuthenticated;
	const isSignIn = router.location.pathname.startsWith("/auth/sign-in");
	const showHeader = !isSignIn;

	// force scroll to top on route change -- router default behavior doesn't seem to be working?
	useEffect(() => {
		window.scrollTo(0, 0);
	}, [router.location.pathname]);

	return (
		<>
			<ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
				{isAuthenticated && <AppSidebar />}
				<BackgroundLayout contentClassName={cn(
					"flex min-h-svh flex-col overflow-x-hidden transition-[margin-left,max-width] duration-200 ease-linear",
					isAuthenticated && (isSidebarExpanded
						? "ml-48 max-w-[calc(100vw-12rem)]"
						: "ml-12 max-w-[calc(100vw-3rem)]"
					),
				)}>
					{showHeader && <Header />}
					<Outlet />
				</BackgroundLayout>
				<Toaster richColors />
			</ThemeProvider>
		</>
	);
}
