import { writeFileSync } from "node:fs"
import { join } from "node:path"
import type { JsonValue } from "@bufbuild/protobuf"

const PAYLOADS_DIR = join(import.meta.dirname, "payloads")

// Uses an inverted timestamp so the most recent file sorts first alphabetically.
// VS Code sorts files lexicographically, so a smaller number = more recent = top of list.
export function saveAgentPayload(payload: JsonValue): void {
  const invertedTs = String(Number.MAX_SAFE_INTEGER - Date.now()).padStart(16, "0")
  const filename = `${invertedTs}.json`
  const filepath = join(PAYLOADS_DIR, filename)
  writeFileSync(filepath, JSON.stringify(payload, null, 2))
}

const OPAMP_CAPABILITIES = {
  ReportsStatus:                    1n << 0n,
  AcceptsRemoteConfig:              1n << 1n,
  ReportsEffectiveConfig:           1n << 2n,
  AcceptsPackages:                  1n << 3n,
  ReportsPackageStatuses:           1n << 4n,
  ReportsOwnTraces:                 1n << 5n,
  ReportsOwnMetrics:                1n << 6n,
  ReportsOwnLogs:                   1n << 7n,
  AcceptsOpAMPConnectionSettings:   1n << 8n,
  AcceptsOtherConnectionSettings:   1n << 9n,
  AcceptsRestartCommand:            1n << 10n,
  ReportsHealth:                    1n << 11n,
  ReportsRemoteConfig:              1n << 12n,
  ReportsAvailableComponents:       1n << 14n,
} as const;

type OpAMPCapability = keyof typeof OPAMP_CAPABILITIES;

export function decodeCapabilities(value: bigint | number): OpAMPCapability[] {
  const bits = BigInt(value);
  return (Object.entries(OPAMP_CAPABILITIES) as [OpAMPCapability, bigint][])
    .filter(([, bit]) => (bits & bit) !== 0n)
    .map(([name]) => name);
}
