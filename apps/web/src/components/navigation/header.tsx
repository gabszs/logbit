import { useRouterState } from "@tanstack/react-router";

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

	return (
		<header className="fixed top-0 z-50 h-13 w-full border-b bg-background/80 px-4 backdrop-blur-sm">
			<nav className="flex h-full items-center">
				{title && <span className="font-medium text-sm">{title}</span>}
			</nav>
		</header>
	);
}
