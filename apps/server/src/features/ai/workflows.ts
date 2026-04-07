// src/workflows/resumo.ts
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({
	id: "receber-texto",
	description: "Recebe o texto do usuário",
	inputSchema: z.object({ texto: z.string() }),
	outputSchema: z.object({ texto: z.string(), palavras: z.number() }),
	execute: async ({ context }) => {
		const texto = context.inputData.texto;
		return { texto, palavras: texto.split(" ").length };
	},
});

const step2 = createStep({
	id: "formatar-resultado",
	description: "Formata o resultado final",
	inputSchema: z.object({ texto: z.string(), palavras: z.number() }),
	outputSchema: z.object({ resultado: z.string() }),
	execute: async ({ context }) => {
		const { texto, palavras } = context.inputData;
		return {
			resultado: `Texto com ${palavras} palavras: "${texto}"`,
		};
	},
});

export const resumoWorkflow = createWorkflow({
	id: "resumo-workflow",
	inputSchema: z.object({ texto: z.string() }),
	outputSchema: z.object({ resultado: z.string() }),
})
	.then(step1)
	.then(step2)
	.commit();
