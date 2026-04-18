# @harness/tools

Sandboxed built-in tools for the harness-starter monorepo. Ships a workspace-rooted filesystem tool and an allowlisted HTTP fetch tool.

## Installation

Workspace-internal — imported by other `@harness/*` packages and apps:

```ts
import { fsTool, fetchTool } from '@harness/tools';
```

## API Reference

### `fsTool`

```ts
function fsTool(opts: { workspace: string; mode?: 'ro' | 'rw' }): Tool;
```

Returns a `Tool` named `"fs"` that reads, writes, and lists files under a workspace directory.

- `workspace` — absolute path to the root directory; all file operations are jailed to this path
- `mode` — `"ro"` (default) allows `read` and `list` only; `"rw"` also allows `write`

**Security:**
- Path traversal (`../`, absolute paths outside workspace) is blocked
- Symlinks pointing outside the workspace are detected and rejected
- Reads are capped at 1 MB to prevent OOM

**Parameters (Zod schema):**

| Field | Type | Description |
|---|---|---|
| `operation` | `"read" \| "write" \| "list"` | Operation to perform (`write` only in `rw` mode) |
| `path` | `string` | Relative path under the workspace |
| `content` | `string` | File content (required for `write`) |

**Example:**

```ts
import { createAgent } from '@harness/agent';
import { fsTool } from '@harness/tools';

const agent = createAgent({
  provider,
  tools: [fsTool({ workspace: '/app/data', mode: 'rw' })],
});
```

### `fetchTool`

```ts
function fetchTool(opts?: {
  allow?: (string | RegExp)[];
  deny?: (string | RegExp)[];
}): Tool;
```

Returns a `Tool` named `"fetch"` that makes HTTP requests with URL policy enforcement.

- `allow` — if provided, the request URL must match at least one entry
- `deny` — if provided, the request URL must not match any entry (checked after allow; deny wins)
- String entries match against the URL hostname; RegExp entries match against the full URL

**Redirect safety:** Redirects are followed manually (up to 5 hops). Each hop is re-validated against the allow/deny policy.

**DNS rebinding:** Known v1 limitation. For untrusted agents, deny-list private IP ranges at the network layer.

**Parameters (Zod schema):**

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | `string` (URL) | — | Request URL |
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE" \| "HEAD"` | `"GET"` | HTTP method |
| `headers` | `Record<string, string>` | — | Request headers |
| `body` | `string` | — | Request body |

Response is returned as a JSON string: `{ status, headers, body }` with body truncated to 1 MB.

**Example:**

```ts
import { createAgent } from '@harness/agent';
import { fetchTool } from '@harness/tools';

const agent = createAgent({
  provider,
  tools: [fetchTool({ allow: ['api.example.com'], deny: [/^https?:\/\/internal\./] })],
});
```

## Test Command

```sh
bun test packages/tools/
```
