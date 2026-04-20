import type { ComponentPropsWithoutRef, CSSProperties } from 'react';
import { useCallback, useState } from 'react';
import type { ExtraProps } from 'react-markdown';
import Markdown from 'react-markdown';
import type { UIEvent } from '../../shared/events.ts';
import { Button } from './primitives.tsx';

type MarkdownCodeProps = ComponentPropsWithoutRef<'code'> & ExtraProps;

function isCodeInsidePre(node: ExtraProps['node']): boolean {
  if (!node || !('parent' in node)) {
    return false;
  }
  const parent = node.parent as { type?: string; tagName?: string } | undefined;
  return parent?.type === 'element' && parent.tagName === 'pre';
}

export interface ReportViewProps {
  report: string | undefined;
  runId: string | null;
  onBack: () => void;
}

/** Prefer the last `complete` payload; otherwise concatenate writer deltas. */
export function deriveReportMarkdown(events: readonly UIEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev?.type === 'complete') {
      const r = ev.report;
      if (typeof r === 'string' && r.trim().length > 0) {
        return r;
      }
      break;
    }
  }

  let fromWriter = '';
  for (const ev of events) {
    if (ev.type === 'writer' && ev.delta) {
      fromWriter += ev.delta;
    }
  }
  if (fromWriter.trim().length > 0) {
    return fromWriter;
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

export function ReportView({ report, runId, onBack }: ReportViewProps) {
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    if (!report) {
      return;
    }
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

  const handleDownload = useCallback(() => {
    if (!report) {
      return;
    }
    const safeName = runId ?? 'report';
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.md`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [report, runId]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s3)',
          padding: 'var(--s3) var(--s5)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          background: 'var(--bg-surface)',
        }}
      >
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back to stream
        </Button>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" disabled={!report} onClick={() => void handleCopy()}>
          Copy MD
        </Button>
        <Button variant="secondary" size="sm" disabled={!report} onClick={handleDownload}>
          Download
        </Button>
        {copyHint && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            {copyHint}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s5)' }}>
        {!report ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200,
              gap: 'var(--s3)',
              color: 'var(--text-disabled)',
              textAlign: 'center',
              padding: 'var(--s8)',
            }}
          >
            <p style={{ fontSize: 'var(--text-md)', color: 'var(--text-tertiary)' }}>
              No report yet
            </p>
            <p style={{ fontSize: 'var(--text-sm)', maxWidth: 360 }}>
              The final report will appear here when the run finishes, or as streamed writer output
              accumulates.
            </p>
          </div>
        ) : (
          <article
            style={{
              maxWidth: 820,
              margin: '0 auto',
              padding: 'var(--s5)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-lg)',
            }}
          >
            <Markdown
              components={{
                h1: ({ children }) => (
                  <h1 style={{ ...mdHeading, fontSize: 'var(--text-2xl)' }}>{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 style={{ ...mdHeading, fontSize: 'var(--text-xl)' }}>{children}</h2>
                ),
                h3: ({ children }) => <h3 style={mdHeading}>{children}</h3>,
                p: ({ children }) => (
                  <p style={{ ...mdProse, marginBottom: 'var(--s3)' }}>{children}</p>
                ),
                ul: ({ children }) => (
                  <ul
                    style={{
                      ...mdProse,
                      marginBottom: 'var(--s3)',
                      paddingLeft: 'var(--s5)',
                    }}
                  >
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol
                    style={{
                      ...mdProse,
                      marginBottom: 'var(--s3)',
                      paddingLeft: 'var(--s5)',
                    }}
                  >
                    {children}
                  </ol>
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
              }}
            >
              {report}
            </Markdown>
          </article>
        )}
      </div>
    </div>
  );
}
