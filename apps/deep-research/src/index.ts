import { parseArgs } from 'node:util';
import pc from 'picocolors';

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

console.log(pc.bold(`\ndeep-research · "${question}"\n`));
console.log(pc.dim('(scaffold only — research pipeline not yet implemented)\n'));
