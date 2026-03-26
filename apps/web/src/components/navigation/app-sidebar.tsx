import { useAuth } from "@/web/components/auth-provider"
import { useTheme } from "@/web/components/theme-provider"
import { Avatar, AvatarFallback, AvatarImage } from "@/web/components/ui/avatar"
import { Button } from "@/web/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu"
import { useProfile } from "@/web/hooks/use-profile"
import { authClient } from "@/web/lib/auth-client"
import { Link, useNavigate } from "@tanstack/react-router"
import {
	BookText,
	CircleHelp,
	LogOut,
	Monitor,
	Moon,
	Settings,
	Sun,
} from "lucide-react"

function getInitial(user: { name?: string | null; email?: string | null } | null | undefined) {
	if (user?.name) return user.name.charAt(0).toUpperCase()
	if (user?.email) return user.email.charAt(0).toUpperCase()
	return "?"
}

export function AppSidebar() {
	const navigate = useNavigate()
	const auth = useAuth()
	const profile = useProfile()
	const { theme, setTheme } = useTheme()

	const user = profile.data
	const isAuthenticated = Boolean(auth.session?.user)

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = "/"
				},
			},
		})
	}

	return (
		<aside className="fixed left-0 top-0 z-50 flex h-svh w-12 flex-col items-center border-r bg-background py-3">
			{/* Top: Cloud icon */}
			<Link to="/" className="mb-4 flex items-center justify-center text-primary">
				<span className="text-2xl">☁️</span>
			</Link>

			{/* Middle: Nav items */}
			<nav className="flex flex-1 flex-col items-center gap-1">
				{/* Add other nav items here if needed */}
			</nav>

			{/* Bottom: Help + Theme toggle + User */}
			<div className="flex flex-col items-center gap-2">
				{/* Help menu */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-9">
							<CircleHelp className="size-5" />
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
							<button type="button" className="rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
								<Avatar className="size-8 cursor-pointer">
									{user?.image && <AvatarImage src={user.image} alt={user.name ?? ""} />}
									<AvatarFallback className="bg-primary/10 font-semibold text-primary text-xs">
										{getInitial(user)}
									</AvatarFallback>
								</Avatar>
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent side="right" align="end" className="w-64">
							<DropdownMenuItem onClick={() => navigate({ to: "/settings/profile" })} className="flex items-center gap-3 px-2 py-2">
								<Avatar className="size-9">
									{user?.image && <AvatarImage src={user.image} alt={user.name ?? ""} />}
									<AvatarFallback className="bg-primary/10 font-semibold text-primary text-sm">
										{getInitial(user)}
									</AvatarFallback>
								</Avatar>
								<div className="flex flex-col overflow-hidden">
									<span className="truncate font-medium text-sm">{user?.name ?? "User"}</span>
									<span className="truncate text-muted-foreground text-xs">{user?.email}</span>
								</div>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => navigate({ to: "/settings/appearance" })}>
								<Settings className="size-4" />
								<span>Settings</span>
							</DropdownMenuItem>
							<DropdownMenuSub>
								<DropdownMenuSubTrigger className="gap-2">
									<Sun className="size-4 shrink-0 dark:hidden" />
									<Moon className="hidden size-4 shrink-0 dark:block" />
									<span>Theme</span>
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
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
	)
}
