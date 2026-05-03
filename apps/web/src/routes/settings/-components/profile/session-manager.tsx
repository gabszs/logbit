import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/web/components/auth-provider";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import { useAuthenticatedQueryEnabled } from "@/web/hooks/use-authenticated-query-enabled";
import { authClient } from "@/web/lib/auth-client";
import { clearAuthenticatedQueries, orpc } from "@/web/lib/orpc";
import type { Session } from "@/web/types/user";
import { getDeviceIcon } from "./utils";

function SessionItem({
	session,
	isCurrentSession,
	isTerminating,
	onTerminate,
	isPending,
}: {
	session: Session;
	isCurrentSession: boolean;
	isTerminating: boolean;
	onTerminate: (session: Session) => void;
	isPending: boolean;
}) {
	const deviceInfo = useQuery({
		...orpc.profile.getDeviceInfo.queryOptions({
			input: {
				userAgent: session.userAgent || null,
			},
		}),
		enabled: !!session.userAgent,
		staleTime: 5 * 60 * 1000,
		retry: 1,
	});

	return (
		<div className="app-surface flex items-center justify-between px-3 py-2.5">
			<div className="flex items-center gap-2">
				{getDeviceIcon(session.userAgent)}
				<span className="text-sm">{deviceInfo.data || "Unknown Device"}</span>
				{isCurrentSession && (
					<Badge variant="default" className="text-xs">
						Current
					</Badge>
				)}
			</div>
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					className="text-red-500 text-xs hover:bg-red-50"
					onClick={() => onTerminate(session)}
					disabled={isTerminating || isPending}
				>
					{isTerminating ? (
						<>
							<Loader2 size={15} className="mr-1 animate-spin" />
							{isCurrentSession ? "Signing out..." : "Terminating..."}
						</>
					) : isCurrentSession ? (
						"Sign Out"
					) : (
						"Terminate"
					)}
				</Button>
			</div>
		</div>
	);
}

export function SessionManager() {
	const [terminatingSession, setTerminatingSession] = useState<string>();
	const auth = useAuth();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const isAuthenticatedQueryEnabled = useAuthenticatedQueryEnabled();

	const sessions = useQuery({
		...orpc.profile.listSessions.queryOptions(),
		enabled: isAuthenticatedQueryEnabled,
		refetchOnWindowFocus: true,
	});

	const revokeSessionMutation = useMutation(
		orpc.profile.revokeSession.mutationOptions({
			onSuccess: () => {
				toast.success("Session terminated successfully");
				sessions.refetch();
				setTerminatingSession(undefined);
			},
			onError: (error) => {
				toast.error(error.message);
				setTerminatingSession(undefined);
			},
		}),
	);

	const handleSessionTerminate = async (session: Session) => {
		const sessionId = session.id || session.token;
		setTerminatingSession(sessionId);

		const isCurrentSession = session.token === auth.session?.session?.token;

		if (isCurrentSession) {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: async () => {
						await navigate({ to: "/auth/sign-in", replace: true });
						await clearAuthenticatedQueries(queryClient);
						toast.success("Signed out successfully");
					},
					onError: () => {
						toast.error("Failed to sign out");
						setTerminatingSession(undefined);
					},
				},
			});
		} else {
			revokeSessionMutation.mutate({ token: session.token });
		}
	};

	const validSessions = (sessions.data || []).filter(
		(session) => session.userAgent != null,
	);

	return (
		<div className="flex w-full flex-col gap-3">
			<h3 className="font-medium text-sm">Active Sessions</h3>
			{sessions.error && !sessions.data ? (
				<p className="text-muted-foreground text-xs">Error loading sessions</p>
			) : validSessions.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					No active sessions found.
				</p>
			) : (
				<div className="space-y-2">
					{validSessions.map((session, index) => {
						const isCurrentSession =
							session.token === auth.session?.session?.token;
						const sessionId = session.id || session.token;
						const isTerminating = terminatingSession === sessionId;

						return (
							<SessionItem
								key={session.id || session.token || index}
								session={session}
								isCurrentSession={isCurrentSession}
								isTerminating={isTerminating}
								onTerminate={handleSessionTerminate}
								isPending={revokeSessionMutation.isPending}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}
