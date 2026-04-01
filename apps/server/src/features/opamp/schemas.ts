import { ContentTypes } from "@/lib/constants";
import z from "zod";

export const AgentToServerResponseSchema = z.string().openapi({
	format: "binary",
	description: "AgentToServer protobuf message (binary serialized)",
	externalDocs: {
		url: "https://github.com/open-telemetry/opamp-spec",
		description: "OpAMP Specification",
	},
	contentMediaType: ContentTypes.X_PROTOBUF,
});


// CONTETNT MEDIA TYPE NAO TA TROCANDO, CHECAR ISSO, MAS O SCHEMA TA FUNCIONANDO, TESTAR COM O TESTE DE PROTOBUF PRA VER SE TA SERIALIZANDO E DESERIALIZANDO CERTO
// OLHAR NA DOC DO ZOD.OPENAPI()
export const serverToAgentResponseSchema = z.string().openapi({
	format: "binary",
	description: "ServerToAgent protobuf message (binary serialized)",
	externalDocs: {
		url: "https://github.com/open-telemetry/opamp-spec",
		description: "OpAMP Specification",
	},
	contentMediaType: ContentTypes.X_PROTOBUF,
});
