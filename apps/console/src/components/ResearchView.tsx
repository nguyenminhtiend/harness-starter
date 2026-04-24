import type { RunStatus, SessionEvent } from '@harness/http/types';
import { type CSSProperties, memo, useEffect, useRef, useState } from 'react';
import { Badge, Button, Spinner } from './primitives.tsx';
import { InlineReport } from './ReportView.tsx';

/* ── Types ────────────────────────────────────────────────────────── */

type ResearchPhase = 'planning' | 'researching' | 'completed' | 'failed' | 'cancelled';

interface ParsedPlan {
  summary: string;
  subquestions: { id: string; question: string }[];
}

interface ResearchState {
  phase: ResearchPhase;
  plan: ParsedPlan | null;
  sources: string[];
  report: string | null;
  eventCount: number;
  usageIn: number;
  usageOut: number;
}

/* ── State derivation ─────────────────────────────────────────────── */

function parsePlan(raw: unknown): ParsedPlan | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.summary !== 'string' || !Array.isArray(p.subquestions)) {
    return null;
  }
  return {
    summary: p.summary,
    subquestions: (p.subquestions as unknown[]).map((sq) => {
      const s = sq as Record<string, unknown>;
      return { id: String(s.id ?? ''), question: String(s.question ?? '') };
    }),
  };
}

function deriveResearchState(
  events: readonly SessionEvent[],
  status: RunStatus | 'idle',
): ResearchState {
  let planRaw: unknown = null;
  let approved = false;
  let report: string | null = null;
  let usageIn = 0;
  let usageOut = 0;
  const seenUrls = new Set<string>();
  const sources: string[] = [];

  for (const e of events) {
    switch (e.type) {
      case 'plan.proposed':
        planRaw = e.plan;
        break;
      case 'approval.resolved':
        if (e.decision.kind === 'approve') {
          approved = true;
        }
        break;
      case 'tool.called':
        if (e.args && typeof e.args === 'object' && 'url' in e.args) {
          const url = (e.args as { url: unknown }).url;
          if (typeof url === 'string' && !seenUrls.has(url)) {
            seenUrls.add(url);
            sources.push(url);
          }
        }
        break;
      case 'artifact':
        if (e.name === 'result' && e.data && typeof e.data === 'object') {
          const d = e.data as Record<string, unknown>;
          if (typeof d.reportText === 'string') {
            report = d.reportText;
          }
        }
        break;
      case 'step.finished':
        usageIn += e.usage?.inputTokens ?? 0;
        usageOut += e.usage?.outputTokens ?? 0;
        break;
      case 'usage':
        usageIn += e.usage.inputTokens ?? 0;
        usageOut += e.usage.outputTokens ?? 0;
        break;
    }
  }

  let phase: ResearchPhase;
  if (status === 'failed') {
    phase = 'failed';
  } else if (status === 'cancelled') {
    phase = 'cancelled';
  } else if (report || status === 'completed') {
    phase = 'completed';
  } else if (approved) {
    phase = 'researching';
  } else {
    phase = 'planning';
  }

  return {
    phase,
    plan: parsePlan(planRaw),
    sources,
    report,
    eventCount: events.length,
    usageIn,
    usageOut,
  };
}

/* ── Workflow Stepper ─────────────────────────────────────────────── */

const STEPS = [
  { id: 'plan', label: 'Plan', color: 'var(--phase-planner)' },
  { id: 'research', label: 'Research', color: 'var(--phase-researcher)' },
  { id: 'report', label: 'Report', color: 'var(--phase-writer)' },
] as const;

function phaseToIndex(phase: ResearchPhase): number {
  switch (phase) {
    case 'planning':
      return 0;
    case 'researching':
      return 1;
    case 'completed':
      return 3;
    default:
      return -1;
  }
}

const checkSvg = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path
      d="M2.5 6L5 8.5L9.5 3.5"
      stroke="#fff"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const chevronSvg = (open: boolean): CSSProperties => ({
  transform: open ? 'rotate(90deg)' : 'rotate(0)',
  transition: 'transform var(--t-base)',
  flexShrink: 0,
});

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={chevronSvg(open)}>
      <path
        d="M3 2L7 5L3 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WorkflowStepper({ phase }: { phase: ResearchPhase }) {
  const idx = phaseToIndex(phase);
  const isFailed = phase === 'failed' || phase === 'cancelled';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--s3) var(--s8)',
        gap: 0,
        width: '100%',
        maxWidth: 520,
        margin: '0 auto',
      }}
    >
      {STEPS.map((step, i) => {
        const done = idx > i;
        const active = idx === i;

        const nodeColor = done
          ? 'var(--status-success)'
          : active
            ? step.color
            : 'var(--border-default)';

        const nodeBg = done ? 'var(--status-success)' : active ? step.color : 'transparent';

        return (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              flex: i < STEPS.length - 1 ? 1 : undefined,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--s1)',
              }}
            >
              <div
                style={{
                  width: active ? 28 : 24,
                  height: active ? 28 : 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: nodeBg,
                  border: `2px solid ${isFailed && active ? 'var(--status-error)' : nodeColor}`,
                  transition: 'all var(--t-base)',
                  ...(active && !isFailed ? { boxShadow: `0 0 0 4px ${step.color}22` } : {}),
                }}
              >
                {done ? (
                  checkSvg
                ) : (
                  <span
                    style={{
                      fontSize: 'var(--text-2xs)',
                      fontWeight: 'var(--weight-semibold)' as unknown as number,
                      color: active ? '#fff' : 'var(--text-disabled)',
                    }}
                  >
                    {i + 1}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: 'var(--text-2xs)',
                  fontWeight: (active
                    ? 'var(--weight-semibold)'
                    : 'var(--weight-medium)') as unknown as number,
                  color: done
                    ? 'var(--status-success)'
                    : active
                      ? step.color
                      : 'var(--text-disabled)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-wide)',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: done ? 'var(--status-success)' : 'var(--border-subtle)',
                  marginBottom: 20,
                  marginInline: 'var(--s2)',
                  borderRadius: 1,
                  transition: 'background var(--t-base)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Plan Card ────────────────────────────────────────────────────── */

function PlanCard({ plan, collapsed }: { plan: ParsedPlan; collapsed: boolean }) {
  const [isOpen, setIsOpen] = useState(true);
  const prevCollapsed = useRef(collapsed);

  useEffect(() => {
    if (collapsed && !prevCollapsed.current) {
      setIsOpen(false);
    }
    prevCollapsed.current = collapsed;
  }, [collapsed]);

  return (
    <div
      style={{
        border: '1px solid var(--phase-planner-border)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        background: 'var(--bg-surface)',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s2)',
          padding: 'var(--s3) var(--s4)',
          background: 'var(--phase-planner-subtle)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--phase-planner)',
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 'var(--weight-semibold)' as unknown as number,
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
        }}
      >
        <ChevronIcon open={isOpen} />
        Research Plan
        <Badge variant="planner" style={{ marginLeft: 'auto' }}>
          {plan.subquestions.length} subquestions
        </Badge>
      </button>
      {isOpen && (
        <div style={{ padding: 'var(--s4)' }}>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-primary)',
              marginBottom: 'var(--s3)',
              lineHeight: 'var(--leading-normal)',
            }}
          >
            {plan.summary}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
            {plan.subquestions.map((sq, i) => (
              <div
                key={sq.id}
                style={{
                  display: 'flex',
                  gap: 'var(--s2)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                  lineHeight: 'var(--leading-normal)',
                }}
              >
                <span
                  style={{
                    color: 'var(--phase-planner)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-2xs)',
                    flexShrink: 0,
                    width: 18,
                    textAlign: 'right',
                    marginTop: 2,
                  }}
                >
                  {i + 1}.
                </span>
                <span>{sq.question}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sources Panel ────────────────────────────────────────────────── */

function SourcesPanel({ sources }: { sources: string[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (sources.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        border: '1px solid var(--phase-researcher-border)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        background: 'var(--bg-surface)',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s2)',
          padding: 'var(--s3) var(--s4)',
          background: 'var(--phase-researcher-subtle)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--phase-researcher)',
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 'var(--weight-semibold)' as unknown as number,
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
        }}
      >
        <ChevronIcon open={isOpen} />
        Sources
        <Badge variant="researcher" style={{ marginLeft: 'auto' }}>
          {sources.length} found
        </Badge>
      </button>
      {isOpen && (
        <div
          style={{
            padding: 'var(--s3) var(--s4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s1)',
          }}
        >
          {sources.map((url) => {
            let hostname = url;
            try {
              hostname = new URL(url).hostname;
            } catch {
              /* keep raw */
            }
            return (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--accent)',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s1)',
                  padding: '2px 0',
                }}
              >
                <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-2xs)' }}>
                  &#8599;
                </span>
                {hostname}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Activity Log ─────────────────────────────────────────────────── */

function eventPreview(event: SessionEvent): string {
  switch (event.type) {
    case 'run.started':
      return event.capabilityId;
    case 'text.delta':
      return event.text.length > 80 ? `${event.text.slice(0, 80)}...` : event.text;
    case 'tool.called':
      return event.tool;
    case 'tool.result':
      return 'result';
    case 'step.finished':
      return '';
    case 'plan.proposed':
      return 'plan ready';
    case 'approval.requested':
      return 'waiting';
    case 'approval.resolved':
      return event.decision.kind;
    case 'artifact':
      return event.name;
    case 'run.completed':
      return 'done';
    case 'run.failed':
      return event.error.message;
    case 'run.cancelled':
      return event.reason ?? 'cancelled';
    default:
      return '';
  }
}

const ActivityLogItem = memo(function ActivityLogItem({ event }: { event: SessionEvent }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--s2)',
        padding: '2px 0',
        fontSize: 'var(--text-2xs)',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-tertiary)',
      }}
    >
      <span
        style={{
          color: 'var(--text-disabled)',
          width: 60,
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {new Date(event.ts).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </span>
      <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>{event.type}</span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {eventPreview(event)}
      </span>
    </div>
  );
});

function ActivityLog({ events }: { events: readonly SessionEvent[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (events.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s2)',
          padding: 'var(--s3) var(--s4)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-tertiary)',
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 'var(--weight-medium)' as unknown as number,
        }}
      >
        <ChevronIcon open={isOpen} />
        Activity log
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-2xs)',
            color: 'var(--text-disabled)',
          }}
        >
          {events.length} events
        </span>
      </button>
      {isOpen && (
        <div
          style={{
            padding: 'var(--s2) var(--s4)',
            maxHeight: 300,
            overflowY: 'auto',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-base)',
          }}
        >
          {events.map((e) => (
            <ActivityLogItem key={`${e.seq}-${e.type}`} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Phase Status ─────────────────────────────────────────────────── */

function PhaseStatus({ phase, label }: { phase: ResearchPhase; label: string }) {
  const isActive = phase !== 'completed' && phase !== 'failed' && phase !== 'cancelled';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s3)',
        padding: 'var(--s2) 0',
      }}
    >
      {isActive && (
        <span style={{ color: 'var(--accent)' }}>
          <Spinner size={14} />
        </span>
      )}
      <span
        style={{
          fontSize: 'var(--text-sm)',
          color: phase === 'failed' ? 'var(--status-error)' : 'var(--text-secondary)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */

export interface ResearchViewProps {
  events: readonly SessionEvent[];
  status: RunStatus | 'idle';
  onRetry?: () => void;
}

export function ResearchView({ events, status, onRetry }: ResearchViewProps) {
  const state = deriveResearchState(events, status);

  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(0);

  if (events.length !== prevLen.current) {
    prevLen.current = events.length;
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }

  const phaseLabel = (() => {
    switch (state.phase) {
      case 'planning':
        return state.plan ? 'Plan ready — review and approve' : 'Creating research plan...';
      case 'researching': {
        const n = state.plan?.subquestions.length;
        return n ? `Researching ${n} subquestions...` : 'Researching...';
      }
      case 'completed':
        return '';
      case 'failed':
        return 'Research failed';
      case 'cancelled':
        return 'Research cancelled';
    }
  })();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Stepper */}
      <div
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          background: 'var(--bg-surface)',
        }}
      >
        <WorkflowStepper phase={state.phase} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s5)' }}>
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
            <Spinner size={18} />
            <span style={{ fontSize: 'var(--text-sm)' }}>Starting research...</span>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--s4)',
              maxWidth: 800,
              margin: '0 auto',
            }}
          >
            {/* Phase indicator */}
            {phaseLabel && <PhaseStatus phase={state.phase} label={phaseLabel} />}

            {/* Plan card */}
            {state.plan && <PlanCard plan={state.plan} collapsed={state.phase !== 'planning'} />}

            {/* Sources */}
            {state.sources.length > 0 && <SourcesPanel sources={state.sources} />}

            {/* Report */}
            {state.report && <InlineReport report={state.report} />}

            {/* Retry for failed/cancelled */}
            {(state.phase === 'failed' || state.phase === 'cancelled') && onRetry && (
              <div style={{ textAlign: 'center', padding: 'var(--s3)' }}>
                <Button variant="primary" size="lg" onClick={onRetry}>
                  Retry
                </Button>
              </div>
            )}

            {/* Usage summary on completion */}
            {state.phase === 'completed' && (state.usageIn > 0 || state.usageOut > 0) && (
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--s4)',
                  padding: 'var(--s3) var(--s4)',
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--r-lg)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-tertiary)',
                }}
              >
                <span>{state.usageIn.toLocaleString()} tokens in</span>
                <span>{state.usageOut.toLocaleString()} tokens out</span>
              </div>
            )}

            {/* Activity log */}
            <ActivityLog events={events} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
