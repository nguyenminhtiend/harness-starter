import { useEffect, useRef, useState } from 'react';
import type { RunStatus, UIEvent } from '../../shared/events.ts';
import { Button } from './primitives.tsx';

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
};

function eventPhase(ev: UIEvent): string {
  return ev.type;
}

function eventContent(ev: UIEvent): string {
  switch (ev.type) {
    case 'planner':
      return `Plan: ${ev.subquestions.length} subquestions`;
    case 'researcher':
      return ev.result ?? `Researching: ${ev.subquestion}`;
    case 'writer':
      return ev.delta ?? 'Writing…';
    case 'factchecker':
      return ev.verdict ? `Verdict: ${ev.verdict}` : 'Checking facts…';
    case 'tool':
      return ev.result ?? `${ev.toolName}(${JSON.stringify(ev.args ?? {})})`;
    case 'agent':
      return ev.message ?? ev.phase;
    case 'metric':
      return `${ev.inputTokens.toLocaleString()} in / ${ev.outputTokens.toLocaleString()} out · $${(ev.costUsd ?? 0).toFixed(4)}`;
    case 'complete':
      return `Done: ${ev.totalTokens.toLocaleString()} tokens · $${(ev.totalCostUsd ?? 0).toFixed(4)}`;
    case 'error':
      return ev.message;
    case 'hitl-required':
      return 'Plan approval required';
    case 'hitl-resolved':
      return `Plan ${ev.decision}d`;
    case 'status':
      return `Status → ${ev.status}`;
    default:
      return '';
  }
}

function isVerbose(ev: UIEvent): boolean {
  return ev.type === 'agent' || ev.type === 'metric' || ev.type === 'status';
}

interface TimelineEventProps {
  event: UIEvent;
  index: number;
  verbose: boolean;
}

function TimelineEvent({ event, index, verbose: _verbose }: TimelineEventProps) {
  const phase = eventPhase(event);
  const meta = PHASE_META[phase] ?? { label: phase, color: 'var(--text-tertiary)' };
  const content = eventContent(event);
  const isV = isVerbose(event);

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
              event.type === 'tool' || event.type === 'metric'
                ? 'var(--font-mono)'
                : 'var(--font-sans)',
          }}
        >
          {content}
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
      </div>
    </div>
  );
}

interface CostCounterProps {
  tokens: number;
  cost: number;
  status: RunStatus | 'idle';
}

function CostCounter({ tokens, cost, status }: CostCounterProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s3)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
      }}
    >
      {status === 'running' && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s1)',
            color: 'var(--status-running)',
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
      <span style={{ color: 'var(--text-tertiary)' }}>{tokens.toLocaleString()} tok</span>
      <span style={{ color: 'var(--text-tertiary)' }}>·</span>
      <span style={{ color: cost > 5 ? 'var(--status-error)' : 'var(--text-secondary)' }}>
        ${cost.toFixed(4)}
      </span>
    </div>
  );
}

interface StreamViewProps {
  events: UIEvent[];
  tokens: number;
  cost: number;
  status: RunStatus | 'idle';
  onViewReport?: () => void;
}

export function StreamView({ events, tokens, cost, status, onViewReport }: StreamViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [verbose, setVerbose] = useState(false);

  const visibleEvents = verbose ? events : events.filter((e) => !isVerbose(e));

  useEffect(() => {
    if (pinned && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  }, [pinned]);

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
        <div style={{ flex: 1 }} />
        <CostCounter tokens={tokens} cost={cost} status={status} />
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
                key={`${ev.ts}-${ev.type}-${ev.runId}`}
                event={ev}
                index={i}
                verbose={verbose}
              />
            ))}
            {status === 'completed' && onViewReport && (
              <div style={{ padding: 'var(--s5)', textAlign: 'center' }}>
                <Button variant="primary" size="lg" onClick={onViewReport}>
                  View Report
                </Button>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
