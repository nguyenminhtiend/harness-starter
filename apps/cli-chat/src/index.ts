import * as readline from 'node:readline';
import { createAgent, createStreamRenderer, inMemoryStore } from '@harness/agent';
import { setupSigint } from '@harness/tui/sigint';
import { createSpinner } from '@harness/tui/spinner';
import { formatUsage } from '@harness/tui/usage';
import pc from 'picocolors';
import { config } from './config.ts';
import { provider } from './provider.ts';

const agent = createAgent({
  provider,
  systemPrompt: config.SYSTEM_PROMPT ?? 'You are a helpful assistant.',
  memory: inMemoryStore(),
});

const conversationId = crypto.randomUUID();

const rl = readline.createInterface({
  input: process.stdin as unknown as NodeJS.ReadableStream,
  output: process.stdout as unknown as NodeJS.WritableStream,
  terminal: process.stdin.isTTY ?? false,
  historySize: 100,
});

let streaming = false;
let streamAc: AbortController | null = null;

function exit() {
  rl.close();
  process.exit(0);
}

setupSigint({
  isStreaming: () => streaming && streamAc !== null,
  onAbort: () => streamAc?.abort(),
  onExit: exit,
});

console.log(`harness cli-chat · model: ${config.MODEL_ID}`);
console.log('Type a message and press Enter. Ctrl+C to quit.\n');

function prompt() {
  rl.question(pc.cyan('you> '), async (line) => {
    if (!line.trim()) {
      prompt();
      return;
    }

    process.stdout.write('\n');

    streamAc = new AbortController();
    streaming = true;

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
        agent.stream({ userMessage: line, conversationId }, { signal: streamAc.signal }),
      );

      const footer = formatUsage({
        totalTokens: summary.usage.totalTokens ?? 0,
        durationMs: summary.durationMs,
      });
      process.stdout.write(`\n${pc.dim(footer)}\n\n`);
    } catch (err) {
      spinner.stop();
      if ((err as Error).name === 'AbortError') {
        process.stdout.write(`\n${pc.dim('(cancelled)')}\n\n`);
      } else {
        console.error(`\n${pc.red('[error]')} ${(err as Error).message ?? err}`);
        process.stdout.write('\n');
      }
    } finally {
      streaming = false;
      streamAc = null;
    }

    prompt();
  });
}

prompt();
