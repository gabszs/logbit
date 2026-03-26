import { createFileRoute } from "@tanstack/react-router";
import { requireAuthenticated } from "@/web/lib/route-guards";

export const Route = createFileRoute("/")({
	beforeLoad: async (opts) => {
		await requireAuthenticated({
			authClient: opts.context.authClient,
			queryClient: opts.context.queryClient,
			location: opts.location,
		});
	},
	component: GuestLanding,
});

function GuestLanding() {
	return <div className="flex-1" />;
}
