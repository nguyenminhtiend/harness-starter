import type { RunStatus, SessionEvent } from '@harness/http/types';
import { memo, useEffect, useRef, useState } from 'react';
import { Button } from './primitives.tsx';
import { InlineReport } from './ReportView.tsx';

const PHASE_META: Record<string, { label: string; color: string }> = {
  'run.started': { label: 'Run', color: 'var(--phase-researcher)' },
  'text.delta': { label: 'Text', color: 'var(--phase-writer)' },
  'tool.called': { label: 'Tool call', color: 'var(--accent)' },
  'tool.result': { label: 'Tool result', color: 'var(--accent)' },
  'step.finished': { label: 'Step', color: 'var(--text-disabled)' },
  'reasoning.delta': { label: 'Thinking', color: 'var(--text-tertiary)' },
  'plan.proposed': { label: 'Plan', color: 'var(--phase-planner)' },
  'approval.requested': { label: 'Approval', color: 'var(--accent)' },
  'approval.resolved': { label: 'Resolved', color: 'var(--text-secondary)' },
  artifact: { label: 'Artifact', color: 'var(--phase-researcher)' },
  usage: { label: 'Usage', color: 'var(--text-tertiary)' },
  'run.completed': { label: 'Complete', color: 'var(--status-success)' },
  'run.failed': { label: 'Error', color: 'var(--status-error)' },
  'run.cancelled': { label: 'Cancelled', color: 'var(--status-cancelled)' },
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

function isVerbose(e: SessionEvent): boolean {
  return e.type === 'step.finished';
}

function shortPreview(event: SessionEvent): string {
  switch (event.type) {
    case 'run.started':
      return event.capabilityId;
    case 'text.delta':
      return event.text;
    case 'tool.called':
      return event.tool;
    case 'tool.result': {
      const result = typeof event.result === 'string' ? event.result : formatJson(event.result);
      return `result · ${truncate(result, 200)}`;
    }
    case 'step.finished': {
      const u = event.usage;
      if (u) {
        return `${(u.inputTokens ?? 0).toLocaleString()} in / ${(u.outputTokens ?? 0).toLocaleString()} out`;
      }
      return 'step complete';
    }
    case 'reasoning.delta':
      return truncate(event.text, 200);
    case 'usage': {
      const u = event.usage;
      const total = u.totalTokens;
      if (typeof total === 'number') {
        return `${total.toLocaleString()} tokens`;
      }
      return `${(u.inputTokens ?? 0).toLocaleString()} in / ${(u.outputTokens ?? 0).toLocaleString()} out`;
    }
    case 'run.completed': {
      const out = event.output;
      if (typeof out === 'string') {
        return truncate(out, 200);
      }
      if (out && typeof out === 'object' && 'totalTokens' in out) {
        const t = (out as { totalTokens?: unknown }).totalTokens;
        if (typeof t === 'number') {
          return `${t.toLocaleString()} tokens`;
        }
      }
      return 'completed';
    }
    case 'run.failed':
      return event.error.message;
    case 'plan.proposed':
      return 'Plan proposed';
    case 'approval.requested':
      return 'Approval required';
    case 'approval.resolved':
      return `Plan ${event.decision.kind === 'approve' ? 'approved' : 'rejected'}`;
    case 'artifact':
      return event.name;
    case 'run.cancelled':
      return event.reason ? truncate(event.reason, 200) : 'cancelled';
  }
}

function expandableBody(event: SessionEvent): string | null {
  switch (event.type) {
    case 'tool.called':
      return formatJson(event.args) || null;
    case 'tool.result':
      return typeof event.result === 'string' ? event.result : formatJson(event.result) || null;
    case 'reasoning.delta':
      return event.text ?? null;
    case 'plan.proposed':
      return formatJson(event.plan) || null;
    case 'approval.requested':
      return formatJson(event.payload) || null;
    case 'approval.resolved':
      return formatJson(event.decision) || null;
    case 'artifact':
      return formatJson(event.data) || null;
    case 'usage':
      return formatJson(event.usage) || null;
    case 'run.completed':
      return formatJson(event.output) || null;
    case 'run.failed':
      return `code: ${event.error.code}\n${event.error.message}`;
    default:
      return null;
  }
}

function hasLongBody(event: SessionEvent): boolean {
  const body = expandableBody(event);
  return body !== null && body.length > 0;
}

interface TimelineEventProps {
  event: SessionEvent;
  index: number;
}

const TimelineEvent = memo(function TimelineEvent({ event, index }: TimelineEventProps) {
  const meta = PHASE_META[event.type] ?? { label: event.type, color: 'var(--text-tertiary)' };
  const preview = shortPreview(event);
  const body = expandableBody(event);
  const isV = isVerbose(event);
  const defaultOpen = event.type === 'tool.called';
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
          {hasLongBody(event) && (
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
            {new Date(event.ts).toLocaleTimeString([], {
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
              event.type === 'tool.called' ||
              event.type === 'tool.result' ||
              event.type === 'step.finished' ||
              event.type === 'usage' ||
              event.type === 'run.started' ||
              event.type === 'artifact' ||
              event.type === 'run.completed'
                ? 'var(--font-mono)'
                : 'var(--font-sans)',
          }}
        >
          {preview}
          {event.type === 'text.delta' && (
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
  events: readonly SessionEvent[];
  status: RunStatus | 'idle';
  onRetry?: () => void;
  report?: string | undefined;
}

export function StreamView({ events, status, onRetry, report }: StreamViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [verbose, setVerbose] = useState(true);

  const visible = verbose ? events : events.filter((e) => !isVerbose(e));

  let usageDisplay: { inputTokens: number; outputTokens: number } | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === 'usage') {
      const u = e.usage;
      usageDisplay = {
        inputTokens: u.inputTokens ?? 0,
        outputTokens: u.outputTokens ?? 0,
      };
      break;
    }
    if (e?.type === 'step.finished' && e.usage) {
      const u = e.usage;
      usageDisplay = {
        inputTokens: u.inputTokens ?? 0,
        outputTokens: u.outputTokens ?? 0,
      };
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
        {events.length === 0 ? (
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
            {visible.map((event, i) => {
              const eventKey = `${event.seq}-${event.type}`;
              return <TimelineEvent key={eventKey} event={event} index={i} />;
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
