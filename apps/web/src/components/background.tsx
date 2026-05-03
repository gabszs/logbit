import type { PropsWithChildren } from "react";
import { cn } from "@/web/utils/cn";

export function AppBackground() {
	return null;
}

interface BackgroundLayoutProps extends PropsWithChildren {
	className?: string;
	contentClassName?: string;
}

export function BackgroundLayout({
	children,
	className,
	contentClassName,
}: BackgroundLayoutProps) {
	return (
		<div className={cn("relative min-h-screen bg-transparent", className)}>
			<AppBackground />
			<div className={cn("relative z-10", contentClassName)}>{children}</div>
		</div>
	);
}
