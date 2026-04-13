import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOutIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/web/components/ui/button";
import { authClient } from "@/web/lib/auth-client";
import { clearAuthenticatedQueries } from "@/web/lib/orpc";

interface SignOutButtonProps {
	className?: string;
	variant?: "ghost" | "outline";
	redirectTo?: "/" | "/auth/sign-in";
}

export function SignOutButton({
	className,
	variant = "ghost",
	redirectTo = "/",
}: SignOutButtonProps) {
	const [isPending, setIsPending] = useState(false);
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const handleSignOut = async () => {
		setIsPending(true);
		await authClient.signOut({
			fetchOptions: {
				onSuccess: async () => {
					await navigate({ to: redirectTo, replace: true });
					await clearAuthenticatedQueries(queryClient);
					toast.success("Signed out successfully");
				},
				onError: () => {
					toast.error("Failed to sign out");
					setIsPending(false);
				},
			},
		});
	};

	return (
		<Button
			variant={variant}
			onClick={handleSignOut}
			disabled={isPending}
			className={className}
		>
			<LogOutIcon className="mr-2 size-4" />
			{isPending ? "Signing out..." : "Sign Out"}
		</Button>
	);
}
