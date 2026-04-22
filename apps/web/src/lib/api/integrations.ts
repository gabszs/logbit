import type { IntegrationsType } from "@/server/features/integrations/schemas";
import { parseHonoResponse } from "@/web/lib/hono-rpc";

export type { IntegrationsType };

interface IntegrationsListResponse {
	message: string;
	data: IntegrationsType[];
	metadata: unknown;
}

const serverUrl = import.meta.env.VITE_SERVER_URL;

export async function getIntegrations(): Promise<IntegrationsType[]> {
	const response = await fetch(`${serverUrl}/v1/integrations`, {
		credentials: "include",
	});
	const result =
		await parseHonoResponse<IntegrationsListResponse>(response);
	return result.data;
}

export const integrationsQueryOptions = () => ({
	queryKey: ["integrations", "list"],
	queryFn: getIntegrations,
});
