export {
	appendReferencesSection,
	type InstalledReference,
	updateAgentFiles,
} from "./agents-md.js";
export {
	cleanShellConfig,
	detectInstallMethod,
	executeUninstall,
	executeUpgrade,
	fetchLatestVersion,
	getCurrentVersion,
	getShellConfigFiles,
	type InstallMethod,
} from "./installation.js";
export * from "./public.js";
