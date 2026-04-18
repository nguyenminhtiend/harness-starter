# @harness/mcp

Adapts any [MCP](https://modelcontextprotocol.io) server into `@harness/agent` `Tool[]`.

## Usage

```ts
import { mcpTools } from '@harness/mcp';
import { createAgent } from '@harness/agent';
import { aiSdkProvider } from '@harness/core';
import { openai } from '@ai-sdk/openai';

const { tools, close } = await mcpTools({
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
});

const agent = createAgent({
  provider: aiSdkProvider(openai('gpt-4o')),
  tools,
});

const result = await agent.run({ userMessage: 'List files in /tmp' });
console.log(result.finalMessage);

await close();
```

## API

| Export | Description |
|--------|------------|
| `mcpTools(config, opts?)` | Connect to MCP server, return adapted `Tool[]` + `close()` |
| `convertMcpTool(def, callFn)` | Convert a single MCP tool definition to a harness `Tool` |
| `jsonSchemaToZod(schema)` | Convert JSON Schema to Zod (common subset) |

### `McpClientConfig`

| Transport | Fields |
|-----------|--------|
| `stdio` | `command`, `args?`, `env?` |
| `http` | `url`, `headers?` |

### `McpToolsOptions`

| Field | Description |
|-------|------------|
| `allow?` | Only include tools with these names |
| `deny?` | Exclude tools with these names |

## Test

```bash
bun test packages/mcp/
```
