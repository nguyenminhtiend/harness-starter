import * as readline from 'node:readline';
import { createAgent, inMemoryStore } from '@harness/agent';
import { createEventBus } from '@harness/core';
import { consoleSink } from '@harness/observability';
import { config } from './config.ts';
import { provider } from './provider.ts';

const bus = createEventBus();
consoleSink(bus, { level: 'quiet' });

const agent = createAgent({
  provider,
  systemPrompt: config.SYSTEM_PROMPT ?? 'You are a helpful assistant.',
  memory: inMemoryStore(),
  events: bus,
});

const conversationId = crypto.randomUUID();
const ac = new AbortController();

const rl = readline.createInterface({
  input: process.stdin as unknown as NodeJS.ReadableStream,
  output: process.stdout as unknown as NodeJS.WritableStream,
  terminal: process.stdin.isTTY ?? false,
});

function cleanup() {
  ac.abort();
  rl.close();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

console.log(`harness cli-chat · model: ${config.MODEL_ID}`);
console.log('Type a message and press Enter. Ctrl+C to quit.\n');

function prompt() {
  rl.question('you> ', async (line) => {
    if (!line.trim()) {
      prompt();
      return;
    }

    process.stdout.write('\nai>  ');

    try {
      for await (const ev of agent.stream(
        { userMessage: line, conversationId },
        { signal: ac.signal },
      )) {
        if (ev.type === 'text-delta') {
          process.stdout.write(ev.delta);
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      console.error('\n[error]', (err as Error).message ?? err);
    }

    process.stdout.write('\n\n');
    prompt();
  });
}

prompt();
