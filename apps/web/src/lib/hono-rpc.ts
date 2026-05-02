import { hc } from "hono/client";
import type { AppType } from "@/index";

const serverUrl = import.meta.env.VITE_SERVER_URL;

if (!serverUrl) {
	throw new Error("VITE_SERVER_URL is not defined");
}

export const honoClient = hc<AppType>(serverUrl, {
	init: {
		credentials: "include",
	},
});

export async function getResponseErrorMessage(response: Response) {
	const contentType = response.headers.get("content-type") ?? "";
	const data =
		contentType.includes("application/json") ||
		contentType.includes("application/problem+json")
			? await response.json()
			: await response.text();

	return typeof data === "object" &&
		data !== null &&
		"detail" in data &&
		typeof data.detail === "string"
		? data.detail
		: typeof data === "object" &&
				data !== null &&
				"message" in data &&
				typeof data.message === "string"
			? data.message
			: `Request failed with status ${response.status}`;
}

export async function getSetupStatus() {
	const response = await honoClient.setup.$get({
		header: {},
	});

	if (!response.ok) {
		throw new Error(await getResponseErrorMessage(response));
	}

	return await response.json();
}
