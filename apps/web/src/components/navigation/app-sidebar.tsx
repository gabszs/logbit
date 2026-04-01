import { Link, useNavigate } from "@tanstack/react-router";
import {
	BookText,
	CircleHelp,
	LogOut,
	Monitor,
	Moon,
	PanelLeftClose,
	PanelLeftOpen,
	Settings,
	Sun,
} from "lucide-react";
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
	const auth = useAuth();
	const profile = useProfile();
	const { setTheme } = useTheme();
	const { isExpanded, toggle: toggleSidebar } = useContentSidebar();

	const user = profile.data;
	const isAuthenticated = Boolean(auth.session?.user);

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = "/";
				},
			},
		});
	};

	return (
		<aside
			className={cn(
				"fixed top-0 left-0 z-50 flex h-svh flex-col border-r bg-background py-3 transition-[width] duration-200 ease-linear",
				isExpanded ? "w-48 items-start px-3" : "w-12 items-center",
			)}
		>
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
			<nav className="flex flex-1 flex-col items-center gap-1">
				{/* Add other nav items here if needed */}
			</nav>

			{/* Bottom: Help + User */}
			<div
				className={cn(
					"flex w-full flex-col gap-2",
					isExpanded ? "items-start" : "items-center",
				)}
			>
				{/* Help menu */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size={isExpanded ? "default" : "icon"}
							className={cn(
								"size-9",
								isExpanded && "h-9 w-full justify-start gap-2",
							)}
						>
							<CircleHelp className="size-4 shrink-0" />
							{isExpanded && <span className="text-sm">Help</span>}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="right" align="start" className="w-48">
						<DropdownMenuItem onClick={() => navigate({ to: "/docs" })}>
							<BookText className="size-4" />
							<span>Documentation</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

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
								className="flex items-center gap-3 px-2 py-2"
							>
								<Avatar className="size-9">
									{user?.image && (
										<AvatarImage src={user.image} alt={user.name ?? ""} />
									)}
									<AvatarFallback className="bg-primary/10 font-semibold text-primary text-sm">
										{getInitial(user)}
									</AvatarFallback>
								</Avatar>
								<div className="flex flex-col overflow-hidden">
									<span className="truncate font-medium text-sm">
										{user?.name ?? "User"}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{user?.email}
									</span>
								</div>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => navigate({ to: "/settings/appearance" })}
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
