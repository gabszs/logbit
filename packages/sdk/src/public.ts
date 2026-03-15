export type {
	Config,
	FileIndex,
	FileIndexEntry,
	FileRole,
	GlobalMap,
	GlobalMapRepoEntry,
	ProjectMap,
	ProjectMapRepoEntry,
	RepoSource,
} from "@loglog/types";
export {
	type AgentConfig,
	agents,
	detectInstalledAgents,
	getAgentConfig,
	getAllAgentConfigs,
} from "./agents.js";
export {
	type AuthData,
	AuthError,
	type AuthStatus,
	clearAuthData,
	getAuthPath,
	getAuthStatus,
	getToken,
	getTokenOrNull,
	isLoggedIn,
	loadAuthData,
	NotLoggedInError,
	refreshAccessToken,
	saveAuthData,
	TokenExpiredError,
} from "./auth.js";
export {
	CloneError,
	type CloneOptions,
	cloneRepo,
	GitError,
	getClonedRepoPath,
	getCommitDistance,
	getCommitSha,
	isRepoCloned,
	listRepos,
	type RemoveOptions,
	RepoExistsError,
	RepoNotFoundError,
	removeRepo,
	type UpdateOptions,
	type UpdateResult,
	updateRepo,
} from "./clone.js";
export {
	getConfigPath,
	getMetaPath,
	getMetaRoot,
	getReferencePath,
	getRepoPath,
	getRepoRoot,
	loadConfig,
	saveConfig,
	toMetaDirName,
	toReferenceFileName,
	toReferenceName,
} from "./config.js";
export { DEFAULT_IGNORE_PATTERNS, VERSION } from "./constants.js";
export {
	FALLBACK_MAPPINGS,
	getNpmKeywords,
	type ResolveDependencyRepoOptions,
	type ResolvedDep,
	resolveDependencyRepo,
	resolveFromNpm,
} from "./dep-mappings.js";
export {
	readGlobalMap,
	removeGlobalMapEntry,
	upsertGlobalMapEntry,
	writeGlobalMap,
	writeProjectMap,
} from "./index-manager.js";
export {
	type Dependency,
	detectManifestType,
	type ManifestType,
	parseDependencies,
} from "./manifest.js";
export {
	type GetMapEntryOptions,
	getMapEntry,
	getProjectMapPath,
	type MapEntry,
	resolveRepoKey,
	type SearchMapOptions,
	type SearchResult,
	searchMap,
} from "./map.js";
export {
	getProvider,
	listProviders,
	listProvidersWithModels,
	type ModelInfo,
	type ProviderInfo,
	type ProviderWithModels,
	validateProviderModel,
} from "./models.js";
export { expandTilde, Paths } from "./paths.js";
export {
	type InstallReferenceMeta,
	installGlobalSkill,
	installReference,
	resolveReferenceKeywords,
} from "./reference.js";

export {
	isReferenceInstalled,
	matchDependenciesToReferences,
	matchDependenciesToReferencesWithRemoteCheck,
	type ReferenceMatch,
	type ReferenceStatus,
} from "./reference-matcher.js";

export {
	type DiscoverOptions,
	type DiscoverResult,
	discoverRepos,
	type GcOptions,
	type GcResult,
	gcRepos,
	getRepoStatus,
	type PruneOptions,
	type PruneResult,
	pruneRepos,
	type RepoStatusOptions,
	type RepoStatusSummary,
	type UpdateAllOptions,
	type UpdateAllResult,
	updateAllRepos,
} from "./repo-manager.js";
export {
	getReferenceFileNameForSource,
	NotGitRepoError,
	PathNotFoundError,
	parseRepoInput,
	RepoSourceError,
} from "./repo-source.js";
