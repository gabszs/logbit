# OpenTelemetry Bun Redis Instrumentation

This package provides automatic instrumentation for Bun's native Redis client (`bun:redis`).

## Installation

```bash
npm install @loglog/bun-instrumentation-redis
```

## Usage

```typescript
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { BunRedisInstrumentation } from '@loglog/bun-instrumentation-redis';

registerInstrumentations({
  instrumentations: [
    new BunRedisInstrumentation({
      requireParentSpan: true,
      dbStatementSerializer: (cmdName, cmdArgs) => {
        return `${cmdName} ${cmdArgs.join(' ')}`;
      },
      responseHook: (span, cmdName, cmdArgs, response) => {
        span.setAttribute('redis.response', JSON.stringify(response));
      },
    }),
  ],
});
```

## Options

| Option | Type | Description |
| --- | --- | --- |
| `dbStatementSerializer` | `DbStatementSerializer` | Custom function to serialize the command to the `db.statement` attribute. |
| `responseHook` | `RedisResponseCustomAttributeFunction` | Function for adding custom attributes on db response. |
| `requireParentSpan` | `boolean` | Require a parent span to create a redis span. Default is `false`. |

## Semantic Conventions

This instrumentation follows the OpenTelemetry semantic conventions for database spans.

- `db.system`: `redis`
- `db.operation.name`: The Redis command name (e.g., `get`, `set`).
- `db.statement`: The serialized command and arguments.
- `server.address`: The Redis server hostname.
- `server.port`: The Redis server port.
