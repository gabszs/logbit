// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { chatAgent } from "./agents";
import { calculadoraTool, climaTool, textoTool } from "./tools";
import { resumoWorkflow } from "./workflows";

export const mastra = new Mastra({
	agents: { chatAgent },
	workflows: { resumoWorkflow },
	tools: { calculadoraTool, climaTool, textoTool },
});
