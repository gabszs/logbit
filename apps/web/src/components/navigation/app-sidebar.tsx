import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
	CircleHelp,
	House,
	LogOut,
	type LucideIcon,
	Monitor,
	Moon,
	PanelLeftClose,
	PanelLeftOpen,
	PlugZap,
	ScrollText,
	Settings,
	Sun,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/web/components/auth-provider";
import { useTheme } from "@/web/components/theme-provider";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/web/components/ui/avatar";
import { Button } from "@/web/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu";
import { useContentSidebar } from "@/web/hooks/use-content-sidebar";
import { useProfile } from "@/web/hooks/use-profile";
import { authClient } from "@/web/lib/auth-client";
import { clearAuthenticatedQueries } from "@/web/lib/orpc";
import { cn } from "@/web/utils/cn";

function getInitial(
	user: { name?: string | null; email?: string | null } | null | undefined,
) {
	if (user?.name) return user.name.charAt(0).toUpperCase();
	if (user?.email) return user.email.charAt(0).toUpperCase();
	return "?";
}

export function AppSidebar() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const auth = useAuth();
	const profile = useProfile();
	const { setTheme } = useTheme();
	const { isExpanded, toggle: toggleSidebar } = useContentSidebar();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	const user = profile.data;
	const isAuthenticated = Boolean(auth.session?.user);

	const navigationItems: Array<{
		to: "/" | "/logs" | "/integrations/connections";
		label: string;
		icon: LucideIcon;
		isActive: boolean;
	}> = [
		{
			to: "/",
			label: "Home",
			icon: House,
			isActive: pathname === "/",
		},
		{
			to: "/logs",
			label: "Logging",
			icon: ScrollText,
			isActive: pathname.startsWith("/logs"),
		},
		{
			to: "/integrations/connections",
			label: "Integrations",
			icon: PlugZap,
			isActive: pathname.startsWith("/integrations/"),
		},
	];

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: async () => {
					await navigate({ to: "/auth/sign-in", replace: true });
					await clearAuthenticatedQueries(queryClient);
					toast.success("Signed out successfully");
				},
				onError: () => {
					toast.error("Failed to sign out");
				},
			},
		});
	};

	return (
		<aside
			className={cn(
				"fixed top-0 left-0 z-50 flex h-svh flex-col border-r bg-background py-3 transition-[width] duration-200 ease-linear",
				isExpanded ? "w-48 items-start px-2" : "w-12 items-center",
			)}
		>
			<button
				type="button"
				aria-label="Toggle Sidebar"
				onClick={toggleSidebar}
				className="absolute inset-y-0 -right-2 w-4 cursor-col-resize transition-colors after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:bg-border/40 after:transition-colors hover:after:bg-border"
			/>
			{/* Top: App logo + toggle */}
			<div
				className={cn(
					"mb-2 flex w-full items-center",
					isExpanded ? "justify-between px-1" : "justify-center",
				)}
			>
				<Link to="/" className="flex items-center gap-2 text-primary">
					<img src="/logo.svg" alt="logbit" className="size-8 shrink-0" />
					{isExpanded && <span className="font-semibold text-sm">logbit</span>}
				</Link>
				{isExpanded && (
					<Button
						variant="ghost"
						size="icon"
						className="size-9 shrink-0"
						onClick={toggleSidebar}
						title="Collapse sidebar"
					>
						<PanelLeftClose className="size-4" />
					</Button>
				)}
			</div>

			{/* Toggle button when collapsed (centered below logo) */}
			{!isExpanded && (
				<Button
					variant="ghost"
					size="icon"
					className="mb-2 size-9 shrink-0"
					onClick={toggleSidebar}
					title="Expand sidebar"
				>
					<PanelLeftOpen className="size-4" />
				</Button>
			)}

			{/* Middle: Nav items */}
			<nav className="flex w-full flex-1 flex-col gap-1">
				{navigationItems.map((item) => {
					const Icon = item.icon;

					return (
						<Link
							key={item.to}
							to={item.to}
							preload="intent"
							className={cn(
								"flex h-9 items-center rounded-lg text-sm transition-colors",
								isExpanded
									? "w-full justify-start gap-2 px-3"
									: "w-9 justify-center self-center",
								item.isActive
									? "bg-primary/10 text-primary"
									: "text-muted-foreground hover:bg-accent hover:text-foreground",
							)}
						>
							<Icon className="size-4 shrink-0" />
							{isExpanded && <span>{item.label}</span>}
						</Link>
					);
				})}
			</nav>

			{/* Bottom: Help + User */}
			<div
				className={cn(
					"flex w-full flex-col gap-2",
					isExpanded ? "items-start" : "items-center",
				)}
			>
				<Button
					asChild
					variant="ghost"
					size={isExpanded ? "default" : "icon"}
					className={cn(
						"size-9",
						isExpanded && "h-9 w-full justify-start gap-2",
					)}
				>
					<Link to="/docs" preload="intent">
						<CircleHelp className="size-4 shrink-0" />
						{isExpanded && <span className="text-sm">Docs</span>}
					</Link>
				</Button>

				{isAuthenticated ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className={cn(
									"rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
									isExpanded &&
										"flex w-full items-center gap-2 rounded-lg p-1 hover:bg-accent",
								)}
							>
								<Avatar className="size-8 shrink-0 cursor-pointer">
									{user?.image && (
										<AvatarImage src={user.image} alt={user.name ?? ""} />
									)}
									<AvatarFallback className="bg-primary/10 font-semibold text-primary text-xs">
										{getInitial(user)}
									</AvatarFallback>
								</Avatar>
								{isExpanded && (
									<div className="flex min-w-0 flex-col overflow-hidden text-left">
										<span className="truncate font-medium text-sm">
											{user?.name ?? "User"}
										</span>
										<span className="truncate text-muted-foreground text-xs">
											{user?.email}
										</span>
									</div>
								)}
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent side="right" align="end" className="w-64">
							<DropdownMenuItem
								onClick={() => navigate({ to: "/settings/profile" })}
								onAuxClick={(e) => {
									if (e.button === 1)
										window.open("/settings/profile", "_blank");
								}}
								className="group flex items-center gap-3 px-2 py-2"
							>
								<Avatar className="size-9">
									{user?.image && (
										<AvatarImage src={user.image} alt={user.name ?? ""} />
									)}
									<AvatarFallback className="bg-primary/10 font-semibold text-primary text-sm">
										{getInitial(user)}
									</AvatarFallback>
								</Avatar>
								<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
									<span className="truncate font-medium text-sm">
										{user?.name ?? "User"}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{user?.email}
									</span>
								</div>
								<span className="hidden shrink-0 text-muted-foreground text-xs group-hover:block">
									Edit
								</span>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => navigate({ to: "/settings/profile" })}
								onAuxClick={(e) => {
									if (e.button === 1)
										window.open("/settings/profile", "_blank");
								}}
							>
								<Settings className="size-4" />
								<span>Settings</span>
							</DropdownMenuItem>
							<DropdownMenuSub>
								<DropdownMenuSubTrigger className="gap-2">
									<Sun className="size-4 shrink-0 dark:hidden" />
									<Moon className="hidden size-4 shrink-0 dark:block" />
									<span>Theme</span>
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent
									sideOffset={8}
									className="-translate-y-1/6"
								>
									<DropdownMenuItem onClick={() => setTheme("light")}>
										<Sun className="size-4" />
										<span>Light</span>
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => setTheme("dark")}>
										<Moon className="size-4" />
										<span>Dark</span>
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => setTheme("system")}>
										<Monitor className="size-4" />
										<span>System</span>
									</DropdownMenuItem>
								</DropdownMenuSubContent>
							</DropdownMenuSub>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={handleSignOut}>
								<LogOut className="size-4" />
								<span>Sign Out</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : (
					<Button
						variant="ghost"
						size="icon"
						className="size-9"
						onClick={() => navigate({ to: "/auth/sign-in" })}
					>
						<Avatar className="size-8">
							<AvatarFallback className="bg-primary/10 font-semibold text-primary text-xs">
								?
							</AvatarFallback>
						</Avatar>
					</Button>
				)}
			</div>
		</aside>
	);
}
