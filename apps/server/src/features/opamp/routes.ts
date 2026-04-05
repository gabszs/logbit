import { create, fromBinary, toBinary, toJson } from "@bufbuild/protobuf";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { requireContentType } from "@/lib/middleware";
import { logger } from "@/lib/telemetry";
import { AgentToServerSchema, ServerToAgentSchema } from "@/proto/gen/opamp_pb";

import { status } from "../../lib/constants";
import type { AppContext } from "../../types";
import {
	AgentToServerResponseSchema,
	serverToAgentResponseSchema,
} from "./schemas";

const opampRouter = new OpenAPIHono<AppContext>();

opampRouter.use(
	"/opamp",
	requireContentType(["application/x-protobuf", "application/protobuf"]),
);

opampRouter.openapi(
	createRoute({
		tags: ["Opamp"],
		summary: "OpamP control endpoint",
		description:
			"Manages the OpAMP communication between agents and the server, handling configuration updates and status reports.",
		method: "post",
		path: "/opamp",
		request: {
			body: {
				required: true,
				content: {
					"application/x-protobuf": {
						schema: AgentToServerResponseSchema,
					},
				},
			},
		},
		responses: {
			[status.OK.code]: status.OK_PROTOBUF.response(
				serverToAgentResponseSchema,
			),
			[status.TOO_MANY_REQUESTS.code]: status.TOO_MANY_REQUESTS.response(),
			[status.INTERNAL_SERVER_ERROR.code]:
				status.INTERNAL_SERVER_ERROR.response(),
		},
	}),
	async (c) => {
		const buffer = await c.req.arrayBuffer();
		const agentToServer = fromBinary(
			AgentToServerSchema,
			new Uint8Array(buffer),
		);

		const AgentToServerJson = toJson(AgentToServerSchema, agentToServer);
		// decodeCapabilities(AgentToServerJson.capabilities);
		// logger.info(AgentToServerJson, { printConsole: true });
		// saveAgentPayload(AgentToServerJson);

		const response = create(ServerToAgentSchema, {
			instanceUid: agentToServer.instanceUid,
		});

		return c.body(toBinary(ServerToAgentSchema, response), 200, {
			"content-type": "application/x-protobuf",
		});
	},
);

export default opampRouter;
