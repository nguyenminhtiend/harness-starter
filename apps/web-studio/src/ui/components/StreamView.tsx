import { memo, useEffect, useRef, useState } from 'react';
import type { LlmMessage, SessionStatus, UIEvent } from '../../shared/events.ts';
import { Button } from './primitives.tsx';
import { InlineReport } from './ReportView.tsx';

const PHASE_META: Record<string, { label: string; color: string }> = {
  planner: { label: 'Planner', color: 'var(--phase-planner)' },
  researcher: { label: 'Researcher', color: 'var(--phase-researcher)' },
  writer: { label: 'Writer', color: 'var(--phase-writer)' },
  factchecker: { label: 'Fact-Checker', color: 'var(--phase-factchecker)' },
  complete: { label: 'Complete', color: 'var(--status-success)' },
  error: { label: 'Error', color: 'var(--status-error)' },
  agent: { label: 'Agent', color: 'var(--text-tertiary)' },
  tool: { label: 'Tool', color: 'var(--accent)' },
  metric: { label: 'Metric', color: 'var(--text-disabled)' },
  status: { label: 'Status', color: 'var(--text-tertiary)' },
  'hitl-required': { label: 'Approval', color: 'var(--accent)' },
  'hitl-resolved': { label: 'Approval', color: 'var(--text-secondary)' },
  node: { label: 'Node', color: 'var(--phase-researcher)' },
  llm: { label: 'LLM', color: 'var(--phase-writer)' },
  'llm-request': { label: 'LLM ← input', color: 'var(--phase-planner)' },
  'llm-response': { label: 'LLM → output', color: 'var(--phase-writer)' },
  'llm-thinking': { label: 'Thinking', color: 'var(--text-tertiary)' },
  'llm-tool-call': { label: 'Tool call', color: 'var(--accent)' },
  'tool-start': { label: 'Tool →', color: 'var(--accent)' },
  'tool-result': { label: 'Tool ←', color: 'var(--accent)' },
  'tool-error': { label: 'Tool ✕', color: 'var(--status-error)' },
};

function metaKey(ev: UIEvent): string {
  if (ev.type === 'llm') {
    return `llm-${ev.phase}`;
  }
  if (ev.type === 'tool') {
    if (ev.isError) {
      return 'tool-error';
    }
    if (ev.result !== undefined) {
      return 'tool-result';
    }
    return 'tool-start';
  }
  return ev.type;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}…`;
}

function formatArgs(args: unknown): string {
  if (args === null || args === undefined) {
    return '';
  }
  if (typeof args === 'string') {
    return args;
  }
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function formatMessageContent(content: unknown): string {
  if (content === null || content === undefined) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === 'object') {
          const p = part as { type?: string; text?: string };
          if (p.type === 'text' && typeof p.text === 'string') {
            return p.text;
          }
          try {
            return JSON.stringify(part);
          } catch {
            return String(part);
          }
        }
        return String(part);
      })
      .join('\n');
  }
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

function formatMessages(messages: LlmMessage[] | undefined): string {
  if (!messages || messages.length === 0) {
    return '(no messages)';
  }
  return messages
    .map((m) => {
      const body = formatMessageContent(m.content);
      return `── ${m.role} ──\n${body}`;
    })
    .join('\n\n');
}

function isVerbose(ev: UIEvent): boolean {
  return ev.type === 'agent' || ev.type === 'metric' || ev.type === 'status';
}

function shortPreview(ev: UIEvent): string {
  switch (ev.type) {
    case 'writer':
      return ev.delta ?? 'Writing…';
    case 'tool': {
      if (ev.isError) {
        return `${ev.toolName || 'tool'} — ${truncate(ev.result ?? 'error', 200)}`;
      }
      if (ev.result !== undefined) {
        const dur = ev.durationMs !== undefined ? `${ev.durationMs}ms · ` : '';
        return `${ev.toolName || 'tool'} · ${dur}${truncate(ev.result, 200)}`;
      }
      return ev.toolName || 'tool';
    }
    case 'agent':
      return ev.message ?? ev.phase;
    case 'metric': {
      const cost = ev.costUsd ? ` · $${ev.costUsd.toFixed(4)}` : '';
      return (
        `${ev.inputTokens.toLocaleString()} in / ` +
        `${ev.outputTokens.toLocaleString()} out${cost}`
      );
    }
    case 'complete': {
      const cost = ev.totalCostUsd ? ` · $${ev.totalCostUsd.toFixed(4)}` : '';
      return `${ev.totalTokens.toLocaleString()} tokens${cost}`;
    }
    case 'error':
      return ev.message;
    case 'hitl-required':
      return 'Plan approval required';
    case 'hitl-resolved':
      return `Plan ${ev.decision}d`;
    case 'status':
      return `Status → ${ev.status}`;
    case 'node':
      return ev.from ? `${ev.from} → ${ev.node}` : ev.node;
    case 'llm': {
      if (ev.phase === 'request') {
        const count = ev.messages?.length ?? 0;
        const provider = ev.providerId ? `${ev.providerId} · ` : '';
        return `${provider}${count} message${count === 1 ? '' : 's'}`;
      }
      if (ev.phase === 'response') {
        return truncate(ev.text ?? '', 200);
      }
      if (ev.phase === 'thinking') {
        return truncate(ev.text ?? '', 200);
      }
      if (ev.phase === 'tool-call') {
        return ev.toolName ?? 'tool';
      }
      return ev.phase;
    }
    default:
      return '';
  }
}

function expandableBody(ev: UIEvent): string | null {
  switch (ev.type) {
    case 'tool': {
      const sections: string[] = [];
      if (ev.args !== undefined) {
        sections.push(`args:\n${formatArgs(ev.args)}`);
      }
      if (ev.result !== undefined) {
        const label = ev.isError ? 'error' : 'result';
        sections.push(`${label}:\n${ev.result}`);
      }
      if (sections.length === 0) {
        return null;
      }
      return sections.join('\n\n');
    }
    case 'llm': {
      if (ev.phase === 'request') {
        return formatMessages(ev.messages);
      }
      if (ev.phase === 'tool-call') {
        return formatArgs(ev.args);
      }
      if (ev.phase === 'response' || ev.phase === 'thinking') {
        return ev.text ?? null;
      }
      return null;
    }
    case 'hitl-required':
      return formatArgs(ev.plan);
    case 'error':
      return ev.code ? `code: ${ev.code}\n${ev.message}` : null;
    default:
      return null;
  }
}

function hasLongBody(ev: UIEvent): boolean {
  const body = expandableBody(ev);
  return body !== null && body.length > 0;
}

interface TimelineEventProps {
  event: UIEvent;
  index: number;
}

const TimelineEvent = memo(function TimelineEvent({ event, index }: TimelineEventProps) {
  const key = metaKey(event);
  const meta = PHASE_META[key] ??
    PHASE_META[event.type] ?? {
      label: event.type,
      color: 'var(--text-tertiary)',
    };
  const preview = shortPreview(event);
  const body = expandableBody(event);
  const isV = isVerbose(event);
  const defaultOpen = event.type === 'llm' && event.phase === 'tool-call';
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
              event.type === 'tool' ||
              event.type === 'metric' ||
              event.type === 'llm' ||
              event.type === 'node'
                ? 'var(--font-mono)'
                : 'var(--font-sans)',
          }}
        >
          {preview}
          {event.type === 'writer' && event.delta && (
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
  events: readonly UIEvent[];
  status: SessionStatus | 'idle';
  onRetry?: () => void;
  report?: string | undefined;
}

export function StreamView({ events, status, onRetry, report }: StreamViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [verbose, setVerbose] = useState(true);

  const visibleEvents = verbose ? events : events.filter((e) => !isVerbose(e));

  let usageDisplay: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev?.type === 'metric') {
      usageDisplay = {
        inputTokens: ev.inputTokens,
        outputTokens: ev.outputTokens,
        costUsd: ev.costUsd ?? 0,
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

  const count = visibleEvents.length;
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
              {usageDisplay.costUsd > 0 ? ` · $${usageDisplay.costUsd.toFixed(4)}` : ''}
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
            <span style={{ fontSize: 'var(--text-sm)' }}>Waiting for events…</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visibleEvents.map((ev, i) => (
              <TimelineEvent
                key={`${ev.ts}-${ev.type}-${'phase' in ev ? ev.phase : ''}-${'toolName' in ev ? ev.toolName : ''}-${ev.runId}`}
                event={ev}
                index={i}
              />
            ))}
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
