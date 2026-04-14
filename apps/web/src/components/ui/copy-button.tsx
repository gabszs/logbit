import type { VariantProps } from "class-variance-authority";
import { Check, Copy } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { cn } from "@/web/utils/cn";
import { Button, type buttonVariants } from "./button";

interface CopyButtonProps
	extends React.ComponentProps<"button">,
		VariantProps<typeof buttonVariants> {
	onCopy: () => Promise<void> | void;
	iconClassName?: string;
}

export function CopyButton({
	onCopy,
	iconClassName,
	className,
	variant = "ghost",
	size = "icon",
	children,
	...props
}: CopyButtonProps) {
	const [isCopied, setIsCopied] = useState(false);

	const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		try {
			await onCopy();
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 1500);
		} catch {
			// errors handled by onCopy caller
		}
	};

	const iconSize = iconClassName ?? (size === "sm" ? "size-4" : "size-3.5");

	return (
		<Button
			type="button"
			variant={variant}
			size={size}
			className={cn(className)}
			onClick={handleClick}
			{...props}
		>
			<div className={cn("relative shrink-0", iconSize)}>
				<Copy
					className={cn(
						"absolute inset-0 transition-all duration-150",
						iconSize,
						isCopied ? "scale-0 opacity-0" : "scale-100 opacity-100",
					)}
				/>
				<Check
					className={cn(
						"absolute inset-0 transition-all duration-150",
						iconSize,
						isCopied ? "scale-100 opacity-100" : "scale-0 opacity-0",
					)}
				/>
			</div>
			{children}
		</Button>
	);
}
