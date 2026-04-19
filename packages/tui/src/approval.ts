import * as readline from 'node:readline';

export interface ApprovalOpts {
  choices?: string[];
  defaultChoice?: string;
}

export function formatPrompt(question: string, opts?: ApprovalOpts): string {
  const choices = opts?.choices ?? ['y', 'n'];
  const def = opts?.defaultChoice ?? 'n';
  const formatted = choices
    .map((c) => (c.toLowerCase() === def.toLowerCase() ? c.toUpperCase() : c))
    .join('/');
  return `${question} [${formatted}] `;
}

export function promptApproval(question: string, opts?: ApprovalOpts): Promise<string> {
  const def = opts?.defaultChoice ?? 'n';
  const prompt = formatPrompt(question, opts);

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin as unknown as NodeJS.ReadableStream,
      output: process.stdout as unknown as NodeJS.WritableStream,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || def);
    });
  });
}
