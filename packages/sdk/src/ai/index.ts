export {
	type GenerateReferenceOptions,
	type GenerateReferenceResult,
	generateReferenceWithAI,
} from "../generate.js";

export {
	InvalidModelError,
	InvalidProviderError,
	OpenCodeReferenceError,
	OpenCodeSDKError,
	ProviderNotConnectedError,
	ServerStartError,
	SessionError,
	TimeoutError,
} from "./errors.js";
export {
	createOpenCodeContext,
	DEFAULT_AI_MODEL,
	DEFAULT_AI_PROVIDER,
	type OpenCodeClient,
	type OpenCodeContext,
	type StreamPromptOptions,
	type StreamPromptResult,
	streamPrompt,
} from "./opencode.js";
