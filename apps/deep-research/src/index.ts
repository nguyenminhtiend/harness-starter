import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import { createStreamRenderer } from '@harness/agent';
import { promptApproval } from '@harness/tui/approval';
import { setupSigint } from '@harness/tui/sigint';
import { createSpinner } from '@harness/tui/spinner';
import { formatUsage } from '@harness/tui/usage';
import pc from 'picocolors';
import { config } from './config.ts';
import { createResearchGraph } from './graph.ts';
import { createPersistence } from './persistence.ts';
import { createProvider } from './provider.ts';
import { slugify } from './report/slug.ts';
import { writeReport } from './report/write.ts';
import type { ResearchPlan } from './schemas/plan.ts';
import type { Report } from './schemas/report.ts';

const HELP = `
${pc.bold('deep-research')} — local-first deep research CLI

${pc.bold('Usage:')}
  deep-research "<question>"

${pc.bold('Flags:')}
  --depth <shallow|medium|deep>  Number of subquestions (3/5/8)    [default: medium]
  --out <dir>                    Output directory for reports       [default: ./reports]
  --no-file                      Stdout only, skip file write
  --no-approval                  Skip HITL plan approval
  --ephemeral                    Use in-memory store (no sqlite)
  --budget-usd <n>               Hard dollar ceiling                [default: 0.50]
  --budget-tokens <n>            Hard token ceiling                 [default: 200000]
  --model <id>                   Override the model ID
  --resume <id>                  Resume a checkpointed run
  --help                         Show this help message
  --version                      Show version

${pc.bold('Exit codes:')}
  0   Success
  1   Budget exceeded
  2   User aborted plan
  3   Fact-check failed after retries
  130 SIGINT
`.trim();

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    depth: { type: 'string', default: 'medium' },
    out: { type: 'string' },
    'no-file': { type: 'boolean', default: false },
    'no-approval': { type: 'boolean', default: false },
    ephemeral: { type: 'boolean', default: false },
    'budget-usd': { type: 'string' },
    'budget-tokens': { type: 'string' },
    model: { type: 'string' },
    resume: { type: 'string' },
    help: { type: 'boolean', default: false },
    version: { type: 'boolean', default: false },
  },
  allowPositionals: true,
  strict: true,
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

if (values.version) {
  console.log('0.0.0');
  process.exit(0);
}

const question = positionals[0];

if (!question?.trim()) {
  console.error(pc.red('Error: a question is required.'));
  console.error(`\nRun ${pc.cyan('deep-research --help')} for usage.\n`);
  process.exit(1);
}

const outDir = values.out ?? config.REPORT_DIR;
const noFile = values['no-file'] ?? false;
const skipApproval = values['no-approval'] ?? false;
const depth = values.depth ?? 'medium';
const modelId = values.model;

const provider = createProvider(modelId);
const ephemeral = values.ephemeral ?? false;
const persistence = await createPersistence({
  ephemeral,
  dataDir: config.DATA_DIR,
});
const { store, checkpointer } = persistence;
const runId = values.resume ?? crypto.randomUUID();

if (persistence.type === 'sqlite') {
  console.log(pc.dim(`Using sqlite storage (${config.DATA_DIR})`));
}

const agent = createResearchGraph({
  provider,
  depth,
  skipApproval,
  checkpointer,
  store,
});

let streamAc: AbortController | null = new AbortController();

setupSigint({
  isStreaming: () => streamAc !== null,
  onAbort: () => {
    streamAc?.abort();
    streamAc = null;
  },
  onExit: () => process.exit(130),
});

console.log(pc.bold(`\ndeep-research · "${question}"\n`));

const spinner = createSpinner();
let firstToken = true;

const renderer = createStreamRenderer({
  onTextDelta: (delta) => {
    if (firstToken) {
      spinner.stop();
      firstToken = false;
    }
    process.stdout.write(delta);
  },
  onToolStart: (_id, name) => {
    process.stdout.write(pc.dim(`\n[fetching: ${name}...]\n`));
  },
  onToolResult: (_id, _result, durationMs) => {
    process.stdout.write(pc.dim(`[done: ${(durationMs / 1000).toFixed(1)}s]\n`));
  },
  onError: () => spinner.stop(),
});

try {
  spinner.start();

  // Phase 1: plan + possible HITL interrupt
  let summary = await renderer.render(
    agent.stream({ userMessage: question }, { signal: streamAc.signal, runId }),
  );

  // If no research text was produced, the graph interrupted at the approval gate
  if (!summary.text.trim() && !skipApproval) {
    spinner.stop();

    const saved = await checkpointer.load(runId);
    const gs = saved?.graphState as { data: Record<string, unknown> } | undefined;
    const plan = gs?.data?.plan as ResearchPlan | undefined;

    if (plan) {
      console.log(pc.bold('Research Plan:\n'));
      for (const sq of plan.subquestions) {
        console.log(`  ${pc.cyan(sq.id)} ${sq.question}`);
        for (const q of sq.searchQueries) {
          console.log(`     ${pc.dim(q)}`);
        }
      }
      console.log('');

      const answer = await promptApproval('Approve plan?', {
        choices: ['y', 'n'],
        defaultChoice: 'n',
      });

      if (answer.toLowerCase() !== 'y') {
        console.log(pc.yellow('\nPlan rejected.'));
        process.exit(2);
      }

      // Patch checkpoint: mark plan as approved
      const checkpoint = await checkpointer.load(runId);
      if (checkpoint?.graphState) {
        (checkpoint.graphState as { data: Record<string, unknown> }).data.approved = true;
        await checkpointer.save(runId, checkpoint);
      }

      // Phase 2: resume — approve passes through, research runs
      streamAc = new AbortController();
      firstToken = true;
      spinner.start();

      summary = await renderer.render(
        agent.stream({ userMessage: question }, { signal: streamAc.signal, runId }),
      );
    }
  }

  spinner.stop();

  const footer = formatUsage({
    totalTokens: summary.usage.totalTokens ?? 0,
    durationMs: summary.durationMs,
  });

  process.stdout.write('\n');

  if (!noFile && summary.text.trim()) {
    const slug = slugify(question);
    fs.mkdirSync(outDir, { recursive: true });

    const report: Report = {
      title: question,
      sections: [{ heading: 'Research', body: summary.text }],
      references: [],
    };
    const filePath = await writeReport(report, outDir, slug);
    console.log(pc.green(`\nReport saved → ${filePath}`));
  }

  console.log(pc.dim(footer));
  persistence.close();
  process.exit(0);
} catch (err) {
  spinner.stop();
  persistence.close();
  if ((err as Error).name === 'AbortError') {
    console.error(`\n${pc.dim('(cancelled)')}`);
    process.exit(130);
  }
  console.error(`\n${pc.red('[error]')} ${(err as Error).message ?? err}`);
  process.exit(1);
}
