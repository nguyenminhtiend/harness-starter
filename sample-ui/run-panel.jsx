// run-panel.jsx — Run Form + Live Stream View

const PHASE_META = {
  planner: {
    label: 'Planner',
    color: 'var(--phase-planner)',
    subtle: 'var(--phase-planner-subtle)',
    border: 'var(--phase-planner-border)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M2 3h8M2 6h5M2 9h6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  researcher: {
    label: 'Researcher',
    color: 'var(--phase-researcher)',
    subtle: 'var(--phase-researcher-subtle)',
    border: 'var(--phase-researcher-border)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 8L11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  writer: {
    label: 'Writer',
    color: 'var(--phase-writer)',
    subtle: 'var(--phase-writer-subtle)',
    border: 'var(--phase-writer-border)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M2 9.5L8.5 3L10.5 5L4 11.5H2V9.5Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  factchecker: {
    label: 'Fact-Checker',
    color: 'var(--phase-factchecker)',
    subtle: 'var(--phase-factchecker-subtle)',
    border: 'var(--phase-factchecker-border)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M2.5 6L5 8.5L9.5 3.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  complete: {
    label: 'Complete',
    color: 'var(--status-success)',
    subtle: 'var(--status-success-subtle)',
    border: 'oklch(70% 0.15 148 / 0.3)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M4 6L5.5 7.5L8 4.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  error: {
    label: 'Error',
    color: 'var(--status-error)',
    subtle: 'var(--status-error-subtle)',
    border: 'oklch(64% 0.18 25 / 0.3)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M6 4V6.5M6 8h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  agent: {
    label: 'Agent',
    color: 'var(--text-tertiary)',
    subtle: 'oklch(20% 0.008 258)',
    border: 'var(--border-subtle)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M2 10.5c0-2.2 1.8-4 4-4s4 1.8 4 4"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  tool: {
    label: 'Tool',
    color: 'var(--accent)',
    subtle: 'var(--accent-subtle)',
    border: 'var(--accent-border)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M8.5 2.5L10 4l-5.5 5.5-2 .5.5-2L8.5 2.5z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M7 4l1.5 1.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  metric: {
    label: 'Metric',
    color: 'oklch(55% 0.008 258)',
    subtle: 'oklch(12% 0.008 258)',
    border: 'var(--border-subtle)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M2 9l2.5-3L7 8l3-5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
};

/* ── Timeline Event Item ── */
const TimelineEvent = ({ event, index, verbose }) => {
  const [expanded, setExpanded] = React.useState(false);
  const meta = PHASE_META[event.phase] || PHASE_META.planner;
  const isVerboseType =
    event.phase === 'agent' || event.phase === 'tool' || event.phase === 'metric';

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--s3)',
        animation: 'slideUp 200ms ease',
        animationFillMode: 'both',
        animationDelay: `${Math.min(index * 20, 200)}ms`,
        opacity: isVerboseType ? 0.85 : 1,
      }}
    >
      {/* Timeline spine */}
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
            width: isVerboseType ? 16 : 20,
            height: isVerboseType ? 16 : 20,
            borderRadius: '50%',
            background: meta.subtle,
            border: `1.5px solid ${meta.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: meta.color,
            flexShrink: 0,
            zIndex: 1,
            marginTop: isVerboseType ? 2 : 0,
          }}
        >
          {meta.icon}
        </div>
        <div
          style={{
            flex: 1,
            width: 1,
            background: isVerboseType ? 'transparent' : 'var(--border-subtle)',
            minHeight: 4,
            borderLeft: isVerboseType ? '1px dashed var(--border-subtle)' : 'none',
          }}
        />
      </div>

      {/* Content */}
      <div
        style={{ flex: 1, paddingBottom: isVerboseType ? 'var(--s1)' : 'var(--s3)', minWidth: 0 }}
      >
        <button
          onClick={() => setExpanded((p) => !p)}
          style={{
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: event.payload ? 'pointer' : 'default',
            padding: 0,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--s2)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', flexWrap: 'wrap' }}
            >
              <span
                style={{
                  fontSize: isVerboseType ? 'var(--text-2xs)' : 'var(--text-xs)',
                  fontWeight: 'var(--weight-medium)',
                  color: meta.color,
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-wide)',
                }}
              >
                {meta.label}
              </span>
              {event.subLabel && (
                <span
                  style={{
                    fontSize: 'var(--text-2xs)',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--bg-overlay)',
                    padding: '1px 5px',
                    borderRadius: 'var(--r-xs)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {event.subLabel}
                </span>
              )}
              {event.laneId && (
                <span
                  style={{
                    fontSize: 'var(--text-2xs)',
                    color: 'var(--text-tertiary)',
                    background: 'var(--bg-overlay)',
                    padding: '1px 5px',
                    borderRadius: 'var(--r-full)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  lane {event.laneId}
                </span>
              )}
              {/* Per-event cost/token in verbose mode */}
              {verbose && event.tokDelta > 0 && (
                <span
                  style={{
                    fontSize: 'var(--text-2xs)',
                    color: 'var(--text-disabled)',
                    fontFamily: 'var(--font-mono)',
                    marginLeft: 'auto',
                    display: 'flex',
                    gap: 6,
                  }}
                >
                  <span>{event.tokDelta.toLocaleString()} tok</span>
                  {event.costDelta > 0 && (
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      ${event.costDelta.toFixed(3)}
                    </span>
                  )}
                </span>
              )}
              {!verbose && (
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
              )}
              {verbose && (
                <span
                  style={{
                    fontSize: 'var(--text-2xs)',
                    color: 'var(--text-disabled)',
                    fontFamily: 'var(--font-mono)',
                    marginLeft: event.tokDelta > 0 ? 0 : 'auto',
                  }}
                >
                  {new Date(event.ts).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              )}
            </div>
            <p
              style={{
                fontSize: isVerboseType ? 'var(--text-xs)' : 'var(--text-sm)',
                color: isVerboseType ? 'var(--text-tertiary)' : 'var(--text-primary)',
                marginTop: isVerboseType ? 1 : 3,
                lineHeight: 'var(--leading-normal)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily:
                  event.phase === 'tool' || event.phase === 'metric'
                    ? 'var(--font-mono)'
                    : 'var(--font-sans)',
              }}
            >
              {event.content}
              {event.streaming && (
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
          {event.payload && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              style={{
                flexShrink: 0,
                marginTop: 4,
                transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
                transition: 'transform var(--t-base)',
                color: 'var(--text-tertiary)',
              }}
            >
              <path
                d="M3 2L7 5L3 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        {expanded && event.payload && (
          <div
            style={{
              marginTop: 'var(--s2)',
              background: 'var(--bg-base)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)',
              padding: 'var(--s3)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              lineHeight: 'var(--leading-loose)',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {typeof event.payload === 'string'
              ? event.payload
              : JSON.stringify(event.payload, null, 2)}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Cost Counter ── */
const CostCounter = ({ tokens, cost, status }) => (
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

/* ── Run Form ── */
const RunForm = ({ form, setForm, onRun, onStop, status, globalSettings }) => {
  const running = status === 'running';
  const MODEL_OPTS = [
    { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ];

  return (
    <div
      style={{ padding: 'var(--s5)', display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}
    >
      {/* Query */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
        <label
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-secondary)',
            letterSpacing: 'var(--tracking-wide)',
            textTransform: 'uppercase',
          }}
        >
          Research Question
        </label>
        <textarea
          value={form.query}
          onChange={(e) => setForm((p) => ({ ...p, query: e.target.value }))}
          placeholder="What would you like to research? Be specific for best results…"
          rows={4}
          disabled={running}
          style={{
            width: '100%',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-md)',
            padding: 'var(--s3)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-md)',
            outline: 'none',
            resize: 'vertical',
            lineHeight: 'var(--leading-normal)',
            transition: 'border-color var(--t-fast)',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !running) onRun();
          }}
        />
      </div>

      {/* CTA */}
      <div
        style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center', marginTop: 'var(--s2)' }}
      >
        {!running ? (
          <Button
            variant="primary"
            size="xl"
            onClick={onRun}
            disabled={!form.query.trim()}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M4 2.5L11.5 7L4 11.5V2.5Z" fill="currentColor" />
            </svg>
            Run
            <span style={{ opacity: 0.6, fontSize: 'var(--text-xs)', marginLeft: 'var(--s1)' }}>
              ⌘↵
            </span>
          </Button>
        ) : (
          <Button
            variant="danger"
            size="xl"
            onClick={onStop}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
            </svg>
            Stop
          </Button>
        )}
      </div>
    </div>
  );
};

/* ── Stream View ── */
const StreamView = ({
  events,
  tokens,
  cost,
  status,
  query,
  runId,
  onViewReport,
  pinned,
  setPinned,
  verbose,
  setVerbose,
}) => {
  const bottomRef = React.useRef(null);
  const containerRef = React.useRef(null);

  const visibleEvents = verbose ? events : events.filter((e) => !e.verboseOnly);

  React.useEffect(() => {
    if (pinned && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  }, [visibleEvents, pinned]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (!atBottom && pinned) setPinned(false);
  };

  const phases = [...new Set(visibleEvents.map((e) => e.phase))];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Stream header */}
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
        <div style={{ flex: 1, minWidth: 0 }}>
          {query && (
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {query}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s4)', flexShrink: 0 }}>
          {/* Phase pills */}
          <div style={{ display: 'flex', gap: 'var(--s1)' }}>
            {phases.map((p) => (
              <Badge key={p} variant={p === 'complete' ? 'success' : p === 'error' ? 'error' : p}>
                {PHASE_META[p]?.label || p}
              </Badge>
            ))}
          </div>
          <CostCounter tokens={tokens} cost={cost} status={status} />
          {/* Verbose toggle */}
          <Tooltip tip={verbose ? 'Verbose on' : 'Verbose off'}>
            <button
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
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M2 7l2-4 2 3 1.5-2L9 7"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              verbose
            </button>
          </Tooltip>
          <Tooltip tip={pinned ? 'Pinned to bottom' : 'Click to re-pin'}>
            <button
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
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path
                  d="M5.5 1v7M3 6l2.5 2.5L8 6"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Events */}
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
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle
                cx="16"
                cy="16"
                r="14"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.4"
              />
              <path
                d="M16 10v6l4 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span style={{ fontSize: 'var(--text-sm)' }}>Waiting for events…</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visibleEvents.map((ev, i) => (
              <TimelineEvent key={ev.id} event={ev} index={i} verbose={verbose} />
            ))}
            {status === 'completed' && (
              <div
                style={{
                  padding: 'var(--s5)',
                  textAlign: 'center',
                  animation: 'slideUp 200ms ease',
                }}
              >
                <Button variant="success" size="lg" onClick={onViewReport}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <rect
                      x="2"
                      y="1.5"
                      width="9"
                      height="10"
                      rx="1.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M4.5 5h4M4.5 7.5h2.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
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
};

Object.assign(window, { RunForm, StreamView, TimelineEvent, CostCounter, PHASE_META });
