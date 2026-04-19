import * as readline from 'node:readline';
import { createAgent, createStreamRenderer, inMemoryStore } from '@harness/agent';
import pc from 'picocolors';
import { config } from './config.ts';
import { provider } from './provider.ts';
import { createSpinner } from './spinner.ts';

const agent = createAgent({
  provider,
  systemPrompt: config.SYSTEM_PROMPT ?? 'You are a helpful assistant.',
  memory: inMemoryStore(),
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
  rl.question(pc.cyan('you> '), async (line) => {
    if (!line.trim()) {
      prompt();
      return;
    }

    process.stdout.write('\n');

    const spinner = createSpinner();
    let firstToken = true;
    spinner.start();

    const renderer = createStreamRenderer({
      onTextDelta: (delta) => {
        if (firstToken) {
          spinner.stop();
          firstToken = false;
        }
        process.stdout.write(delta);
      },
      onError: () => spinner.stop(),
    });

    try {
      const summary = await renderer.render(
        agent.stream({ userMessage: line, conversationId }, { signal: ac.signal }),
      );

      const tokens = summary.usage.totalTokens ?? 0;
      const duration = (summary.durationMs / 1000).toFixed(1);
      process.stdout.write(`\n${pc.dim(`(${tokens} tokens · ${duration}s)`)}\n\n`);
    } catch (err) {
      spinner.stop();
      if ((err as Error).name === 'AbortError') {
        return;
      }
      console.error(`\n${pc.red('[error]')} ${(err as Error).message ?? err}`);
      process.stdout.write('\n');
    }

    prompt();
  });
}

prompt();
