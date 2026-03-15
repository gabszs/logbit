/**
 * XDG-based directory paths for loglog CLI
 * Uses xdg-basedir package for cross-platform compatibility (Linux/macOS)
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { xdgConfig, xdgData, xdgState } from "xdg-basedir";

const APP_NAME = "loglog";

/**
 * Main namespace for all XDG-compliant paths
 */
export const Paths = {
	/**
	 * XDG_CONFIG_HOME/loglog
	 * Fallback: ~/.config/loglog
	 */
	get config(): string {
		return join(xdgConfig ?? join(homedir(), ".config"), APP_NAME);
	},

	/**
	 * XDG_DATA_HOME/loglog
	 * Fallback: ~/.local/share/loglog
	 */
	get data(): string {
		return join(xdgData ?? join(homedir(), ".local", "share"), APP_NAME);
	},

	/**
	 * XDG_STATE_HOME/loglog
	 * Fallback: ~/.local/state/loglog
	 */
	get state(): string {
		return join(xdgState ?? join(homedir(), ".local", "state"), APP_NAME);
	},

	/**
	 * Configuration file path: ~/.config/loglog/loglog.json
	 */
	get configFile(): string {
		return join(this.config, "loglog.json");
	},

	/**
	 * Auth file path: ~/.local/share/loglog/auth.json
	 */
	get authFile(): string {
		return join(this.data, "auth.json");
	},

	/**
	 * Meta directory: ~/.local/share/loglog/meta
	 */
	get metaDir(): string {
		return join(this.data, "meta");
	},

	/**
	 * Default repo root: ~/ow
	 */
	get defaultRepoRoot(): string {
		return join(homedir(), "ow");
	},

	/**
	 * loglog single-skill directory: ~/.local/share/loglog/skill/loglog
	 */
	get loglogSkillDir(): string {
		return join(this.data, "skill", "loglog");
	},

	/**
	 * loglog references directory: ~/.local/share/loglog/skill/loglog/references
	 */
	get loglogReferencesDir(): string {
		return join(this.loglogSkillDir, "references");
	},

	/**
	 * loglog assets directory: ~/.local/share/loglog/skill/loglog/assets
	 */
	get loglogAssetsDir(): string {
		return join(this.loglogSkillDir, "assets");
	},

	/**
	 * Global map path: ~/.local/share/loglog/skill/loglog/assets/map.json
	 */
	get loglogGlobalMapPath(): string {
		return join(this.loglogAssetsDir, "map.json");
	},
};

/**
 * Expands ~ to user's home directory (for backward compatibility)
 */
export function expandTilde(path: string): string {
	if (path.startsWith("~/")) {
		return join(homedir(), path.slice(2));
	}
	return path;
}
