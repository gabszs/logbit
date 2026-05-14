# Session Replay Implementation Context

Use this document as the handoff entrypoint for implementing the Dex tasks related to frontend session replay.

## New Chat Prompt

```text
Leia docs/web/session-replay-implementation-context.md, depois leia as tasks Dex relacionadas a "frontend session replay via OTel Logs" e implemente as tarefas pendentes.
```

## Dex Instructions

Use Dex as the task source of truth. Do not rely on task IDs from this document; Dex IDs are ephemeral.

Recommended flow:

```bash
dex list --query "session replay"
dex list --query "frontend session replay"
```

Find the root task named:

```text
Implement frontend session replay via OTel Logs
```

Then read the full root task and all subtasks:

```bash
dex show <root-task-id> --full
dex list <root-task-id>
dex show <subtask-id> --full
```

Expected task titles:

- `Implement frontend session replay via OTel Logs`
- `Add rrweb session replay recorder over OTel Logs`
- `Route session.replay logs to ClickHouse sessions table`
- `Add manual replay controls to integrations proxy page`
- `Build replay query, chunk reassembly, and modal player`
- `Add session replay action to client spans in trace waterfall`
- `Add tests and verification for session replay v1`

## Decisions Already Made

- Use `rrweb` for DOM recording and replay.
- Use OpenTelemetry Logs as the transport.
- Use OTel semantic attribute `session.id` for correlation.
- Use custom replay attributes under `session.replay.*`.
- Do not use `loglog.session_replay.*` for the new contract except as an optional backward-compatible collector route.
- Store replay logs in `default.otel_sessions`.
- Query replay data directly from the frontend through the existing ClickHouse proxy client.
- Open replay in a modal overlay from the trace waterfall.
- Show the `session` action only for client spans with a `session.id`.
- Do not implement the later plug-and-play SDK extraction in this pass.
- ClickHouse session replay queries target the JSON-column schema only. Do not add Map-style access such as `ResourceAttributes['session.id']` or fallback Map semantics.

Replay LogRecord contract:

```ts
eventName: "session.replay.chunk"
severityText: "INFO"
body: string // chunk of the serialized rrweb JSON event
attributes: {
	"session.id": string,
	"session.replay.event": true,
	"session.replay.format": "rrweb",
	"session.replay.version": "1",
	"session.replay.offset": number,
	"session.replay.event_id": number,
	"session.replay.chunk": number,
	"session.replay.total_chunks": number,
	"session.replay.body_encoding": "json-fragment",
}
```

Recorder defaults:

- max chunk body size: `900 KiB`
- max serialized rrweb event size: `5 MiB`
- `maskAllInputs: true`
- conservative text masking
- `stop` pauses recording emission
- `start` after `stop` resumes and forces a full snapshot
- `deinit` cleans up rrweb and forces OTel log flush

## Required References

Read these before implementing:

- `docs/hyperdx-js/rrweb-recording.md`
  - Best reference for rrweb event lifecycle, chunking, offsets, replay startup, and player seeking.
- `docs/hyperdx-js/analysis.md`
  - Architecture summary for HyperDX frontend RUM, replay logs, trace correlation, and timeline sync.
- `docs/hyperdx/analise-telemetria-hyperdx-clickhouse.md`
  - Collector-to-ClickHouse architecture, routing pattern, sessions table behavior.
- `docs/hyperdx/otel-collector-clickhouse-ingestao.md`
  - ClickHouse exporter/schema notes, JSON schema behavior, and ingestion boundaries.
- `docs/web/otel.md`
  - Loglog frontend OTel intent and manual verification notes. Treat code as source of truth when docs drift.
- `docs/web/reusable-row-side-panel.md`
  - Side panel context and explicit note that session replay was out of v1 scope.
- `docs/web/componentes/trace-waterfall-side-panel.md`
  - Trace waterfall architecture, adapters, aliases, row identity, and test expectations.

Read these code paths before editing:

- `apps/web/src/lib/otel.ts`
  - Existing frontend OTel traces, metrics, logs, resource attributes, and providers.
- `apps/web/src/lib/log-handler.ts`
  - Existing browser error log capture and OTel logger usage.
- `apps/web/src/lib/session.ts`
  - Current `session.id` source.
- `apps/otel-collector/config.yaml`
  - Existing logs routing to `otel_sessions`.
- `apps/web/src/routes/integrations/proxy.tsx`
  - Manual OTel test page where replay controls should be added.
- `apps/web/src/components/trace-waterfall/trace-waterfall-panel.tsx`
  - UI where the client-span `session` action should appear.
- `apps/web/src/components/trace-waterfall/trace-waterfall-model.ts`
  - Span/log normalization and helper location for eligibility tests.
- `apps/web/src/components/data-row-side-panel/data-row-side-panel.tsx`
  - Trace panel slot and data flow into the waterfall.
- `apps/web/src/components/data-row-side-panel/types.ts`
  - Adapter and trace query result types.
- `apps/web/src/routes/logs/-lib/logs-row-panel.ts`
  - Existing ClickHouse query construction for trace waterfall and source integration.
- `apps/web/src/lib/clickhouse-client.ts`
  - Existing frontend ClickHouse proxy query helpers.
- `apps/web/package.json`
  - Add `rrweb` dependency here.
- `apps/web/.env.example`
  - Add any replay-related opt-in env if implementation introduces one.

## Implementation Shape

Suggested module boundaries:

- Recorder:
  - `apps/web/src/lib/session-replay.ts`
  - owns rrweb recording lifecycle, event chunking, OTel log emission, counters, and flush.
- Replay query/player:
  - component/module under `apps/web/src/components/session-replay/`
  - owns querying `default.otel_sessions`, reassembling chunks, parsing rrweb events, and modal player.
- Trace waterfall integration:
  - keep span eligibility and `session.id` extraction testable.
  - only client spans get the replay action.
- Manual controls:
  - add a card in `/integrations/proxy` beside the existing OTel Stack Test card.

Query requirements:

- Use the same connection as the trace source.
- Query `default.otel_sessions`.
- Filter by `session.id` from `ResourceAttributes` and/or `LogAttributes`.
- Use JSON paths only, such as `ResourceAttributes.session.id` and `LogAttributes.session.replay.event`.
- Order by timestamp, `session.replay.offset`, and `session.replay.chunk`.
- Reassemble chunks by `session.replay.event_id`.
- Parse each assembled body as rrweb JSON.
- Seek the player near the clicked span timestamp.

## Verification

Automated:

```bash
bun test
turbo typecheck
```

Targeted tests to add:

- chunking round-trip reconstructs original event JSON.
- chunk body size stays below the configured max.
- oversize event handling drops or sanitizes deterministically.
- `session.id` extraction works for object/string `ResourceAttributes` or `LogAttributes`.
- client-span eligibility only enables replay for client spans with `session.id`.
- replay query reassembly orders by offset, event id, and chunk number.

Manual:

1. Start collector and ClickHouse.
2. Run frontend with OTel enabled.
3. Open `/integrations/proxy`.
4. Start replay recording, interact with the page, stop, then deinit.
5. Confirm POST requests to `/v1/logs`.
6. Query `default.otel_sessions` and verify `session.replay.event = true`.
7. Open a trace containing a frontend client span with `session.id`.
8. Click the `session` action and verify the replay modal opens and seeks near the span time.

## Current Follow-ups

- The trace waterfall can show a static replay-availability icon for client spans with confirmed replay data, but the icon's vertical alignment is still not right. It currently appears visually misaligned relative to the span name and duration label. Revisit the row layout in `apps/web/src/components/trace-waterfall/trace-waterfall-panel.tsx`; prefer aligning the replay icon using the same vertical rhythm as the duration text rather than adding a separate fixed-height box.
- The replay availability query should keep filtering by `ServiceName` and `session_id`, but avoid a trace timestamp window because replay chunks can fall outside the span time range.

## Important Cautions

- Preserve user changes in dirty files. Check `git status --short` before editing.
- Do not edit generated `routeTree.gen.ts`.
- Do not add the plug-and-play SDK extraction; keep this pass app-local.
- Keep replay data masked by default.
- Keep the collector backward-compatible with existing `loglog.session_replay.event` only if it does not complicate the new `session.replay.event` path.
