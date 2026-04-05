import { create, fromBinary, toBinary, toJson } from "@bufbuild/protobuf";
import { AgentToServerSchema, ServerToAgentSchema } from "@/proto/gen/opamp_pb";

// Monta a mensagem
const msg = create(AgentToServerSchema, {
	instanceUid: new TextEncoder().encode("test-agent-001"),
});

// Serializa pra binário
const body = toBinary(AgentToServerSchema, msg);

// Faz a request
const res = await fetch("http://localhost:5051/v1/opamp", {
	method: "POST",
	headers: { "Content-Type": "application/x-protobuf" },
	body,
});

// Deserializa a resposta
const resBody = await res.arrayBuffer();
const resMsg = fromBinary(ServerToAgentSchema, new Uint8Array(resBody));

console.log("Status:", res.status);
// console.log("Resposta:", JSON.stringify(resMsg, null, 2))

console.log(
	`Received OpAMP message: ${JSON.stringify(toJson(ServerToAgentSchema, resMsg))}`,
);
