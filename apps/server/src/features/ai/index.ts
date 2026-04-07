// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { auth } from "@/lib/auth";
import { chatAgent } from "./agents";
import { calculadoraTool, climaTool, textoTool } from "./tools";
import { resumoWorkflow } from "./workflows";
import { MastraAuthBetterAuth } from '@mastra/auth-better-auth'


const mastraAuth = new MastraAuthBetterAuth({
  	auth,
	// protected: ["/v1/ai/*"],
})


export const mastra = new Mastra({
	server: {
		auth: mastraAuth,
	},
	agents: { chatAgent },
	workflows: { resumoWorkflow },
	tools: { calculadoraTool, climaTool, textoTool },
});
