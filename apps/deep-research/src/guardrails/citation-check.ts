import type { OutputHook } from '@harness/agent';

const URL_RE = /https?:\/\/[^\s)"'<>]+/g;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE);
  return matches ? [...new Set(matches)] : [];
}

/** Library utility — not wired into the graph pipeline. Used for programmatic citation validation. */
/**
 * Output hook that blocks when the report cites URLs that were never fetched
 * during research. Pass the set of fetched URLs at creation time.
 */
export function citationCheckHook(fetchedUrls: Set<string>): OutputHook {
  return async ({ message }) => {
    const text =
      typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    const cited = extractUrls(text);

    if (cited.length === 0) {
      return { action: 'pass' };
    }

    const unfetched = cited.filter((u) => !fetchedUrls.has(u));
    if (unfetched.length === 0) {
      return { action: 'pass' };
    }

    return {
      action: 'block',
      reason: `Report cites ${unfetched.length} URL(s) not found in research sources: ${unfetched.join(', ')}`,
    };
  };
}
