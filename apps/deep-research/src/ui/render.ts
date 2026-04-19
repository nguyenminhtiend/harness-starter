import type { StreamRendererCallbacks } from '@harness/agent';
import { createSpinner } from '@harness/tui/spinner';
import pc from 'picocolors';

type Phase = 'planning' | 'researching' | 'writing' | 'fact-checking' | 'done';

export interface DeepResearchRendererOpts {
  verbose?: boolean;
}

export function createDeepResearchRenderer(
  opts?: DeepResearchRendererOpts,
): StreamRendererCallbacks {
  const spinner = createSpinner();
  let phase: Phase = 'planning';
  let firstToken = true;

  function setPhase(next: Phase, label: string) {
    spinner.stop();
    phase = next;
    if (next !== 'done') {
      process.stdout.write(`${label}\n`);
      spinner.start();
    }
  }

  return {
    onTextDelta: (delta) => {
      if (firstToken) {
        spinner.stop();
        firstToken = false;
      }
      if (opts?.verbose) {
        process.stdout.write(delta);
      }
    },

    onToolStart: (_id, name) => {
      if (phase === 'planning') {
        setPhase('researching', `\n${pc.cyan('📋')} plan created`);
      }
      process.stdout.write(pc.dim(`  ├─ ${name}…\n`));
    },

    onToolResult: (_id, _result, durationMs) => {
      process.stdout.write(pc.dim(`  │  ${pc.green('✓')} ${(durationMs / 1000).toFixed(1)}s\n`));
    },

    onHandoff: (_from, to) => {
      spinner.stop();
      if (to.includes('writer') || to.includes('write')) {
        setPhase('writing', `\n${pc.cyan('✍️')}  writing…`);
      } else if (to.includes('fact') || to.includes('check')) {
        setPhase('fact-checking', `\n${pc.cyan('🔍')} fact-checking…`);
      } else {
        process.stdout.write(pc.dim(`  → handoff to ${to}\n`));
      }
    },

    onCheckpoint: (runId) => {
      if (phase === 'planning') {
        spinner.stop();
        process.stdout.write(pc.dim(`  (checkpointed: ${runId.slice(0, 8)})\n`));
      }
    },

    onBudgetExceeded: (kind, spent, limit) => {
      spinner.stop();
      process.stdout.write(
        pc.yellow(`\n  ⚠ budget exceeded: ${kind} — spent ${spent}, limit ${limit}\n`),
      );
    },

    onCompaction: (droppedTurns, summaryTokens) => {
      process.stdout.write(
        pc.dim(`  (compacted: dropped ${droppedTurns} turns, ${summaryTokens} tokens)\n`),
      );
    },

    onAbort: () => {
      spinner.stop();
    },

    onError: () => {
      spinner.stop();
    },

    onFinish: () => {
      spinner.stop();
      if (phase !== 'done') {
        phase = 'done';
      }
    },
  };
}
