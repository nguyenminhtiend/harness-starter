import { calculatorTool } from './calculator.ts';
import { fetchTool } from './fetch.ts';
import { fsTool } from './fs.ts';
import { getTimeTool } from './get-time.ts';

export { calculatorTool } from './calculator.ts';
export type { FetchUrlPolicy } from './fetch.ts';
export { assertUrlAllowed, fetchTool } from './fetch.ts';
export { fsTool } from './fs.ts';
export { getTimeTool } from './get-time.ts';

/**
 * Returns all ready-to-use tools keyed by name. Fetch uses open policy;
 * fs uses cwd read-only — suitable for dev (Studio) environments only.
 */
export const allTools = () => ({
  calculator: calculatorTool,
  fetch: fetchTool(),
  fs: fsTool({ workspace: process.cwd(), mode: 'ro' }),
  getTime: getTimeTool,
});
