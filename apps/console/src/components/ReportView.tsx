import type { SessionEvent } from '@harness/http/types';
import type { ComponentPropsWithoutRef, CSSProperties } from 'react';
import { useCallback, useState } from 'react';
import type { Components, ExtraProps } from 'react-markdown';
import Markdown from 'react-markdown';

type MarkdownCodeProps = ComponentPropsWithoutRef<'code'> & ExtraProps;

function isCodeInsidePre(node: ExtraProps['node']): boolean {
  if (!node || !('parent' in node)) {
    return false;
  }
  const parent = node.parent as { type?: string; tagName?: string } | undefined;
  return parent?.type === 'element' && parent.tagName === 'pre';
}

function reportFromOutput(output: unknown): string | undefined {
  if (typeof output === 'string' && output.trim().length > 0) {
    return output;
  }
  if (output && typeof output === 'object') {
    if ('reportText' in output) {
      const rt = (output as { reportText: unknown }).reportText;
      if (typeof rt === 'string' && rt.trim().length > 0) {
        return rt;
      }
    }
    if ('report' in output) {
      const r = (output as { report: unknown }).report;
      if (typeof r === 'string' && r.trim().length > 0) {
        return r;
      }
    }
  }
  return undefined;
}

/**
 * Extract the report markdown from session events.
 * Priority: run.completed output → artifact 'result' → text.delta concatenation.
 */
export function deriveReportMarkdown(events: readonly SessionEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === 'run.completed') {
      const r = reportFromOutput(e.output);
      if (r) {
        return r;
      }
      break;
    }
  }

  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === 'artifact' && e.name === 'result') {
      const r = reportFromOutput(e.data);
      if (r) {
        return r;
      }
      if (typeof e.data === 'string' && e.data.trim().length > 0) {
        return e.data;
      }
    }
  }

  const deltas: string[] = [];
  for (const e of events) {
    if (e.type === 'text.delta' && e.text) {
      deltas.push(e.text);
    }
  }
  if (deltas.length > 0) {
    const joined = deltas.join('');
    if (joined.trim().length > 0) {
      return joined;
    }
  }
  return undefined;
}

const mdProse: CSSProperties = {
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--leading-loose)',
  color: 'var(--text-primary)',
};

const mdHeading: CSSProperties = {
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--weight-semibold)',
  marginTop: 'var(--s5)',
  marginBottom: 'var(--s2)',
  color: 'var(--text-primary)',
};

const mdComponents: Components = {
  h1: ({ children }) => <h1 style={{ ...mdHeading, fontSize: 'var(--text-2xl)' }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ ...mdHeading, fontSize: 'var(--text-xl)' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={mdHeading}>{children}</h3>,
  p: ({ children }) => <p style={{ ...mdProse, marginBottom: 'var(--s3)' }}>{children}</p>,
  ul: ({ children }) => (
    <ul style={{ ...mdProse, marginBottom: 'var(--s3)', paddingLeft: 'var(--s5)' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ ...mdProse, marginBottom: 'var(--s3)', paddingLeft: 'var(--s5)' }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ marginBottom: 'var(--s1)' }}>{children}</li>,
  code: ({ className, children, node }: MarkdownCodeProps) => {
    const isInline = !isCodeInsidePre(node);
    if (isInline) {
      return (
        <code
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            background: 'var(--bg-overlay)',
            padding: '1px 5px',
            borderRadius: 'var(--r-xs)',
          }}
        >
          {children}
        </code>
      );
    }
    return (
      <pre
        style={{
          ...mdProse,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--r-sm)',
          padding: 'var(--s3)',
          overflowX: 'auto',
          marginBottom: 'var(--s3)',
        }}
      >
        <code className={className}>{children}</code>
      </pre>
    );
  },
  a: ({ href, children }) => {
    const isSafe = typeof href === 'string' && /^https?:\/\//.test(href);
    if (!isSafe) {
      return (
        <span style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}>
          {children}
        </span>
      );
    }
    return (
      <a
        href={href}
        style={{ color: 'var(--accent)', textDecoration: 'underline' }}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
  blockquote: ({ children }) => (
    <blockquote
      style={{
        borderLeft: '3px solid var(--accent-border)',
        paddingLeft: 'var(--s3)',
        marginBottom: 'var(--s3)',
        color: 'var(--text-secondary)',
        fontStyle: 'italic',
      }}
    >
      {children}
    </blockquote>
  ),
};

export interface InlineReportProps {
  report: string;
}

export function InlineReport({ report }: InlineReportProps) {
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopyHint('Copied');
      setTimeout(() => {
        setCopyHint(null);
      }, 2000);
    } catch {
      setCopyHint('Copy failed');
      setTimeout(() => {
        setCopyHint(null);
      }, 2000);
    }
  }, [report]);

  return (
    <div
      style={{
        marginTop: 'var(--s5)',
        borderTop: '2px solid var(--accent-border)',
        paddingTop: 'var(--s4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s3)',
          marginBottom: 'var(--s3)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--weight-semibold)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wide)',
            color: 'var(--accent)',
          }}
        >
          Report
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--r-sm)',
            fontSize: 'var(--text-2xs)',
            fontFamily: 'var(--font-sans)',
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            transition: 'all var(--t-fast)',
          }}
        >
          {copyHint ?? 'Copy MD'}
        </button>
      </div>
      <article
        style={{
          padding: 'var(--s5)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--r-lg)',
        }}
      >
        <Markdown components={mdComponents}>{report}</Markdown>
      </article>
    </div>
  );
}
