import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/web/components/ui/button";
import { useIsMobile } from "@/web/hooks/use-mobile";
import { useUserSettings } from "@/web/hooks/use-user-settings";
import { cn } from "@/web/utils/cn";

const CHAT_SIDEBAR_EVENT = "better-chat:open-history";
const SETTINGS_SIDEBAR_EVENT = "better-chat:open-settings";

export default function Header() {
	const location = useRouterState({ select: (state) => state.location });
	const isMobile = useIsMobile();
	const pathname = location.pathname ?? "";
	const isChatRoute = pathname.startsWith("/chat");
	const isSettingsRoute = pathname.startsWith("/settings");
	const showSidebarToggle = isMobile && (isChatRoute || isSettingsRoute);

	const settingsQuery = useUserSettings();

	const handleToggleSidebar = () => {
		if (isChatRoute) {
			window.dispatchEvent(new CustomEvent(CHAT_SIDEBAR_EVENT));
			return;
		}
		if (isSettingsRoute) {
			window.dispatchEvent(new CustomEvent(SETTINGS_SIDEBAR_EVENT));
		}
	};

	return (
		<header className="fixed top-0 z-50 h-13 w-full border-b bg-background/80 px-4 backdrop-blur-sm">
			<nav
				className={cn(
					"mx-auto flex items-center py-1.5",
					settingsQuery.data?.chatWidth === "comfortable"
						? "max-w-7xl"
						: "max-w-5xl",
				)}
			>
				{showSidebarToggle && (
					<Button
						variant="ghost"
						size="icon"
						onClick={handleToggleSidebar}
						className="md:hidden"
					>
						<img src="/logo.svg" alt="Toggle sidebar" className="size-6" />
					</Button>
				)}
			</nav>
		</header>
	);
}
