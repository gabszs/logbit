# @loglog/sdk

Core business logic for loglog.

Powers the CLI and web app with git clone management, AI reference generation, and agent skill distribution.

## Installation

```bash
bun add @loglog/sdk
```

### Optional dependencies

- Sync: `bun add convex`
- AI: `bun add @opencode-ai/sdk`

### Entry points

- `@loglog/sdk` (core local functionality)
- `@loglog/sdk/sync` (Convex sync)
- `@loglog/sdk/ai` (AI generation)
- `@loglog/sdk/internal` (CLI-only helpers)
- `@loglog/sdk/convex/api` and `@loglog/sdk/convex/server` (Convex types)

## Modules

| Module                 | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `config.ts`            | Config load/save, path utilities                   |
| `paths.ts`             | XDG-compliant path resolution                      |
| `clone.ts`             | Git clone/update/remove                            |
| `index-manager.ts`     | Global + project map management                    |
| `reference.ts`         | Reference install + SKILL.md                       |
| `generate.ts`          | AI reference generation (`@loglog/sdk/ai`)       |
| `sync.ts`              | Convex client for push/pull (`@loglog/sdk/sync`) |
| `auth.ts`              | WorkOS token management                            |
| `agents.ts`            | Agent registry                                     |
| `agents-md.ts`         | AGENTS.md reference table generation (internal)    |
| `repo-source.ts`       | Parse repo input (URL, owner/repo, local)          |
| `manifest.ts`          | Dependency parsing (package.json, etc.)            |
| `dep-mappings.ts`      | npm package to GitHub repo resolution              |
| `reference-matcher.ts` | Match deps to installed references                 |
| `repo-manager.ts`      | Bulk repo operations (update, prune, gc)           |
| `models.ts`            | AI provider/model registry                         |
| `installation.ts`      | Upgrade/uninstall utilities                        |

## Usage

### Config & Paths

```typescript
import { loadConfig, saveConfig, Paths } from "@loglog/sdk";

const config = loadConfig();
const skillDir = Paths.loglogDir;
const globalMap = Paths.globalMap;
```

### Clone Management

```typescript
import { cloneRepo, updateRepo, removeRepo } from "@loglog/sdk";

await cloneRepo(repoSource);
await updateRepo("owner/repo");
await removeRepo("owner/repo", { referenceOnly: true });
```

### Reference Generation

```typescript
import { generateReferenceWithAI } from "@loglog/sdk/ai";
import { installReference } from "@loglog/sdk";

const result = await generateReferenceWithAI(repoPath, { model: "claude-sonnet-4-20250514" });
await installReference("owner/repo", result.referenceContent, result.commitSha);
```

### Map Management

```typescript
import { readGlobalMap, writeProjectMap, upsertGlobalMapEntry } from "@loglog/sdk";

const globalMap = readGlobalMap();
await upsertGlobalMapEntry("owner/repo", { localPath, references: ["repo.md"] });
await writeProjectMap(cwd, projectMap);
```

### Sync (Push/Pull)

```typescript
import { pullReference, pushReference, checkRemote } from "@loglog/sdk/sync";

const ref = await pullReference("owner/repo");
await pushReference("owner/repo", referenceData);
```

### Dependency Resolution

```typescript
import {
	parseDependencies,
	resolveDependencyRepo,
	matchDependenciesToReferences,
} from "@loglog/sdk";

const deps = parseDependencies("package.json");
const repo = await resolveDependencyRepo("zod", "^3.0.0");
const matches = matchDependenciesToReferences(deps);
```

## Data Paths

| Purpose    | Getter                |
| ---------- | --------------------- |
| Config     | `Paths.config`        |
| Data root  | `Paths.data`          |
| Skill dir  | `Paths.loglogDir`   |
| Global map | `Paths.globalMap`     |
| References | `Paths.referencesDir` |

## Commands

```bash
bun run build        # Build with tsdown
bun run dev          # Watch mode
bun run typecheck    # Type check
bun run test         # Run tests
```
