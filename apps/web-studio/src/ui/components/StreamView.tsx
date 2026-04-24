import { memo, useEffect, useRef, useState } from 'react';
import type { SessionStatus, StreamChunk } from '../../shared/events.ts';
import { Button } from './primitives.tsx';
import { InlineReport } from './ReportView.tsx';

const PHASE_META: Record<string, { label: string; color: string }> = {
  'text-delta': { label: 'Text', color: 'var(--phase-writer)' },
  'tool-call': { label: 'Tool call', color: 'var(--accent)' },
  'tool-result': { label: 'Tool result', color: 'var(--accent)' },
  'tool-error': { label: 'Tool error', color: 'var(--status-error)' },
  'step-finish': { label: 'Step', color: 'var(--text-disabled)' },
  'reasoning-delta': { label: 'Thinking', color: 'var(--text-tertiary)' },
  status: { label: 'Status', color: 'var(--text-tertiary)' },
  error: { label: 'Error', color: 'var(--status-error)' },
  done: { label: 'Complete', color: 'var(--status-success)' },
  'hitl-required': { label: 'Approval', color: 'var(--accent)' },
  'hitl-resolved': { label: 'Resolved', color: 'var(--text-secondary)' },
  node: { label: 'Node', color: 'var(--phase-researcher)' },
};

function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}…`;
}

function formatJson(v: unknown): string {
  if (v === null || v === undefined) {
    return '';
  }
  if (typeof v === 'string') {
    return v;
  }
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function isVerbose(c: StreamChunk): boolean {
  return c.type === 'status' || c.type === 'step-finish';
}

function shortPreview(c: StreamChunk): string {
  switch (c.type) {
    case 'text-delta':
      return (c.text as string) ?? '';
    case 'tool-call':
      return (c.toolName as string) ?? 'tool';
    case 'tool-result': {
      const result = typeof c.result === 'string' ? c.result : formatJson(c.result);
      return `${(c.toolName as string) ?? 'tool'} · ${truncate(result, 200)}`;
    }
    case 'tool-error':
      return `${(c.toolName as string) ?? 'tool'} — ${truncate(formatJson(c.error), 200)}`;
    case 'step-finish': {
      const u = c.totalUsage as { inputTokens?: number; outputTokens?: number } | undefined;
      if (u) {
        return `${(u.inputTokens ?? 0).toLocaleString()} in / ${(u.outputTokens ?? 0).toLocaleString()} out`;
      }
      return 'step complete';
    }
    case 'reasoning-delta':
      return truncate((c.text as string) ?? '', 200);
    case 'done': {
      const tokens = c.totalTokens as number | undefined;
      return tokens ? `${tokens.toLocaleString()} tokens` : 'done';
    }
    case 'error':
      return (c.message as string) ?? 'unknown error';
    case 'hitl-required':
      return 'Plan approval required';
    case 'hitl-resolved':
      return `Plan ${c.decision as string}d`;
    case 'status':
      return `Status → ${c.status as string}`;
    case 'node':
      return c.from ? `${c.from as string} → ${c.node as string}` : (c.node as string);
    default:
      return c.type;
  }
}

function expandableBody(c: StreamChunk): string | null {
  switch (c.type) {
    case 'tool-call':
      return formatJson(c.args) || null;
    case 'tool-result':
      return typeof c.result === 'string' ? c.result : formatJson(c.result) || null;
    case 'tool-error':
      return formatJson(c.error) || null;
    case 'hitl-required':
      return formatJson(c.plan) || null;
    case 'error':
      return c.code ? `code: ${c.code as string}\n${c.message as string}` : null;
    case 'reasoning-delta':
      return (c.text as string) ?? null;
    default:
      return null;
  }
}

function hasLongBody(c: StreamChunk): boolean {
  const body = expandableBody(c);
  return body !== null && body.length > 0;
}

interface TimelineChunkProps {
  chunk: StreamChunk;
  index: number;
}

const TimelineChunk = memo(function TimelineChunk({ chunk, index }: TimelineChunkProps) {
  const meta = PHASE_META[chunk.type] ?? { label: chunk.type, color: 'var(--text-tertiary)' };
  const preview = shortPreview(chunk);
  const body = expandableBody(chunk);
  const isV = isVerbose(chunk);
  const defaultOpen = chunk.type === 'tool-call';
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--s3)',
        animation: 'slideUp 200ms ease',
        animationFillMode: 'both',
        animationDelay: `${Math.min(index * 20, 200)}ms`,
        opacity: isV ? 0.7 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: 20,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: isV ? 12 : 16,
            height: isV ? 12 : 16,
            borderRadius: '50%',
            background: 'var(--bg-overlay)',
            border: `1.5px solid ${meta.color}`,
            flexShrink: 0,
            zIndex: 1,
            marginTop: isV ? 4 : 2,
          }}
        />
        <div
          style={{
            flex: 1,
            width: 1,
            background: isV ? 'transparent' : 'var(--border-subtle)',
            minHeight: 4,
            borderLeft: isV ? '1px dashed var(--border-subtle)' : 'none',
          }}
        />
      </div>
      <div style={{ flex: 1, paddingBottom: isV ? 'var(--s1)' : 'var(--s3)', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
          <span
            style={{
              fontSize: isV ? 'var(--text-2xs)' : 'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
              color: meta.color,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
            }}
          >
            {meta.label}
          </span>
          {hasLongBody(chunk) && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-tertiary)',
                borderRadius: 'var(--r-sm)',
                padding: '0 6px',
                height: 18,
                cursor: 'pointer',
                fontSize: 'var(--text-2xs)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {open ? '− collapse' : '+ expand'}
            </button>
          )}
          <span
            style={{
              fontSize: 'var(--text-2xs)',
              color: 'var(--text-disabled)',
              fontFamily: 'var(--font-mono)',
              marginLeft: 'auto',
            }}
          >
            {new Date(chunk.ts).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </div>
        <p
          style={{
            fontSize: isV ? 'var(--text-xs)' : 'var(--text-sm)',
            color: isV ? 'var(--text-tertiary)' : 'var(--text-primary)',
            marginTop: isV ? 1 : 3,
            lineHeight: 'var(--leading-normal)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily:
              chunk.type === 'tool-call' ||
              chunk.type === 'tool-result' ||
              chunk.type === 'step-finish' ||
              chunk.type === 'node'
                ? 'var(--font-mono)'
                : 'var(--font-sans)',
          }}
        >
          {preview}
          {chunk.type === 'text-delta' && typeof chunk.text === 'string' && (
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: 13,
                background: 'var(--accent)',
                marginLeft: 2,
                animation: 'pulse 0.8s ease-in-out infinite',
                verticalAlign: 'text-bottom',
                borderRadius: 1,
              }}
            />
          )}
        </p>
        {open && body && (
          <pre
            style={{
              marginTop: 'var(--s2)',
              padding: 'var(--s2) var(--s3)',
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-2xs)',
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 360,
              overflowY: 'auto',
            }}
          >
            {body}
          </pre>
        )}
      </div>
    </div>
  );
});

interface StreamViewProps {
  chunks: readonly StreamChunk[];
  status: SessionStatus | 'idle';
  onRetry?: () => void;
  report?: string | undefined;
}

export function StreamView({ chunks, status, onRetry, report }: StreamViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [verbose, setVerbose] = useState(true);

  const visible = verbose ? chunks : chunks.filter((c) => !isVerbose(c));

  let usageDisplay: { inputTokens: number; outputTokens: number } | null = null;
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    if (c?.type === 'step-finish') {
      const u = c.totalUsage as { inputTokens?: number; outputTokens?: number } | undefined;
      if (u) {
        usageDisplay = {
          inputTokens: u.inputTokens ?? 0,
          outputTokens: u.outputTokens ?? 0,
        };
      }
      break;
    }
  }

  const prevCountRef = useRef(0);

  useEffect(() => {
    if (pinned && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  }, [pinned]);

  const count = visible.length;
  if (count !== prevCountRef.current) {
    prevCountRef.current = count;
    if (pinned && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  }

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (!atBottom && pinned) {
      setPinned(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s3)',
          padding: 'var(--s3) var(--s5)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          {usageDisplay && (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
              }}
            >
              {usageDisplay.inputTokens.toLocaleString()} in
              {' / '}
              {usageDisplay.outputTokens.toLocaleString()} out
            </span>
          )}
        </div>
        {status === 'running' && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s1)',
              color: 'var(--status-running)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'currentColor',
                display: 'inline-block',
                animation: 'pulse 1.2s ease-in-out infinite',
              }}
            />
            live
          </span>
        )}
        <button
          type="button"
          onClick={() => setVerbose((p) => !p)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s1)',
            padding: '3px 8px',
            borderRadius: 'var(--r-sm)',
            background: verbose ? 'var(--accent-subtle)' : 'transparent',
            border: `1px solid ${verbose ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
            color: verbose ? 'var(--accent)' : 'var(--text-tertiary)',
            cursor: 'pointer',
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            transition: 'all var(--t-fast)',
          }}
        >
          verbose
        </button>
        <button
          type="button"
          onClick={() => setPinned((p) => !p)}
          style={{
            background: pinned ? 'var(--accent-subtle)' : 'transparent',
            border: `1px solid ${pinned ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--r-sm)',
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: pinned ? 'var(--accent)' : 'var(--text-tertiary)',
            transition: 'all var(--t-fast)',
          }}
        >
          ↓
        </button>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: 'var(--s5) var(--s5) 0' }}
      >
        {chunks.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 'var(--s3)',
              color: 'var(--text-disabled)',
            }}
          >
            <span style={{ fontSize: 'var(--text-sm)' }}>Waiting for stream…</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visible.map((c, i) => {
              const chunkKey = `${c.ts}-${c.type}-${(c.toolName as string) ?? ''}-${(c.toolCallId as string) ?? ''}`;
              return <TimelineChunk key={chunkKey} chunk={c} index={i} />;
            })}
            {(status === 'failed' || status === 'cancelled') && onRetry && (
              <div style={{ padding: 'var(--s5)', textAlign: 'center' }}>
                <Button variant="primary" size="lg" onClick={onRetry}>
                  Retry
                </Button>
              </div>
            )}
            {report && <InlineReport report={report} />}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
