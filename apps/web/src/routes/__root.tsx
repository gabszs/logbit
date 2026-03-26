import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import type { AuthContextValue } from "@/web/components/auth-provider";
import { BackgroundLayout } from "@/web/components/background";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { AppSidebar } from "@/web/components/navigation/app-sidebar";
import { NotFound } from "@/web/components/not-found";
import { ThemeProvider } from "@/web/components/theme-provider";
import { Toaster } from "@/web/components/ui/sonner";
import type { authClient } from "@/web/lib/auth-client";
import type { orpc } from "@/web/lib/orpc";
import "@/web/index.css";
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

	// force scroll to top on route change -- router default behavior doesn't seem to be working?
	useEffect(() => {
		window.scrollTo(0, 0);
	}, [router.location.pathname]);

	return (
		<>
			<ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
				<AppSidebar />
				<BackgroundLayout contentClassName="ml-12 flex min-h-svh max-w-[calc(100vw-3rem)] flex-col overflow-x-hidden">
					<Outlet />
				</BackgroundLayout>
				<Toaster richColors />
			</ThemeProvider>
		</>
	);
}
