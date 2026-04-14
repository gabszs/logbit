import { createFileRoute } from "@tanstack/react-router";
import { InvitationDecisionForm } from "../-components/invites/invitation-decision-form";
import { SettingsError } from "../-components/settings-error";
import { SettingsSectionSkeleton } from "../-components/settings-section-skeleton";

export const Route = createFileRoute("/settings/invitations/$invitationId")({
	component: InvitationDetailsRoute,
	pendingComponent: SettingsSectionSkeleton,
	errorComponent: SettingsError,
});

function InvitationDetailsRoute() {
	const { invitationId } = Route.useParams();

	return <InvitationDecisionForm invitationId={invitationId} />;
}
