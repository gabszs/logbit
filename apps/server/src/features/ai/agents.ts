// src/agents/chat.ts
import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { calculadoraTool, climaTool, textoTool } from "./tools";

export const chatAgent = new Agent({
	name: "chat-agent",
	instructions: `
    Você é um assistente prestativo. Responda sempre em português.
    Você tem acesso a ferramentas de cálculo, clima e análise de texto.
    Use-as sempre que o usuário pedir informações relacionadas.
  `,
	model: openai("gpt-4o-mini"),
	tools: {
		calculadoraTool,
		climaTool,
		textoTool,
	},
});
