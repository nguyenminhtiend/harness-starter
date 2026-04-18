# @harness/memory-sqlite

SQLite-backed `ConversationStore` and `Checkpointer` for `@harness/agent`. Uses `bun:sqlite` (zero external dependencies) with WAL mode for crash safety.

This is the default durability story — swap in when you need conversation history and checkpoint state to survive process restarts.

## Public API

| Export | Type | Description |
|---|---|---|
| `sqliteStore({ path })` | `ConversationStore` | Persists message history per `conversationId` |
| `sqliteCheckpointer({ path })` | `Checkpointer` | Persists `RunState` snapshots per `runId` |

Both functions can share the same `.db` file (tables don't collide) or use separate files.

## Usage

```ts
import { createAgent } from '@harness/agent';
import { sqliteStore, sqliteCheckpointer } from '@harness/memory-sqlite';

const agent = createAgent({
  provider,
  memory: sqliteStore({ path: './data/conversations.db' }),
  checkpointer: sqliteCheckpointer({ path: './data/conversations.db' }),
  tools: [/* ... */],
});

// Messages and checkpoints now survive restarts
const result = await agent.run({
  conversationId: 'conv-123',
  userMessage: 'Hello!',
});
```

## Tests

```sh
bun test packages/memory-sqlite
```
