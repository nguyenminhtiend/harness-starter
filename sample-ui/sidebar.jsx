// sidebar.jsx — Tool Picker + Run History Sidebar

const TOOLS = [
  {
    id: 'deep-research',
    label: 'Deep Research',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 10L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path
          d="M4.5 6.5H8.5M6.5 4.5V8.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'summarizer',
    label: 'Summarizer',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect
          x="2.5"
          y="2.5"
          width="11"
          height="11"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5 6h6M5 8.5h4M5 11h5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
    disabled: true,
  },
  {
    id: 'web-search',
    label: 'Web Search',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M8 2.5C8 2.5 6 5 6 8s2 5.5 2 5.5M8 2.5C8 2.5 10 5 10 8s-2 5.5-2 5.5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path d="M2.5 8h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
    disabled: true,
  },
  {
    id: 'fact-check',
    label: 'Fact Checker',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M3 4.5h10M3 8h7M3 11.5h5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle cx="12.5" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M14.5 13l1 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
    disabled: true,
  },
];

const STATUS_COLORS = {
  running: 'var(--status-running)',
  completed: 'var(--status-success)',
  failed: 'var(--status-error)',
  cancelled: 'var(--status-cancelled)',
};

const RelTime = ({ ts }) => {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const RunCard = ({ run, active, onClick }) => {
  const toolIcon = TOOLS.find((t) => t.id === run.tool)?.icon;
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        background: active ? 'var(--bg-elevated)' : 'transparent',
        border: `1px solid ${active ? 'var(--border-default)' : 'transparent'}`,
        borderRadius: 'var(--r-md)',
        padding: 'var(--s2) var(--s3)',
        cursor: 'pointer',
        transition: 'background var(--t-fast), border-color var(--t-fast)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s1)',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--bg-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s2)',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s2)',
            color: 'var(--text-tertiary)',
            minWidth: 0,
          }}
        >
          <span style={{ color: STATUS_COLORS[run.status], flexShrink: 0 }}>{toolIcon}</span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-secondary)',
            }}
          >
            {TOOLS.find((t) => t.id === run.tool)?.label ?? run.tool}
          </span>
        </div>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: STATUS_COLORS[run.status],
            flexShrink: 0,
          }}
        />
      </div>
      <p
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-primary)',
          lineHeight: 'var(--leading-tight)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          margin: 0,
        }}
      >
        {run.query}
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--s2)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-2xs)',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          ${run.cost?.toFixed(3) ?? '—'}
        </span>
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
          <RelTime ts={run.ts} />
        </span>
      </div>
    </button>
  );
};

const Sidebar = ({
  activeTool,
  setActiveTool,
  history,
  activeRunId,
  onSelectRun,
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
}) => {
  const filteredHistory = history.filter((r) => {
    const matchQ = !searchQuery || r.query.toLowerCase().includes(searchQuery.toLowerCase());
    const matchS = !filterStatus || r.status === filterStatus;
    return matchQ && matchS;
  });

  return (
    <div
      style={{
        width: 'var(--sidebar-w)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}
    >
      {/* Logo / wordmark */}
      <div
        style={{
          padding: 'var(--s3) var(--s4)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s2)',
          height: 'var(--header-h)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="2" width="7" height="7" rx="1.5" fill="var(--accent)" />
          <rect
            x="11"
            y="2"
            width="7"
            height="7"
            rx="1.5"
            fill="var(--phase-researcher)"
            opacity="0.7"
          />
          <rect
            x="2"
            y="11"
            width="7"
            height="7"
            rx="1.5"
            fill="var(--phase-writer)"
            opacity="0.7"
          />
          <rect
            x="11"
            y="11"
            width="7"
            height="7"
            rx="1.5"
            fill="var(--phase-factchecker)"
            opacity="0.7"
          />
        </svg>
        <span
          style={{
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--weight-semibold)',
            letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
          }}
        >
          web-studio
        </span>
      </div>

      {/* Tool picker */}
      <div style={{ padding: 'var(--s3) var(--s2)' }}>
        <div
          style={{
            fontSize: 'var(--text-2xs)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-tertiary)',
            letterSpacing: 'var(--tracking-wide)',
            textTransform: 'uppercase',
            padding: '0 var(--s2) var(--s2)',
          }}
        >
          Tools
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => !tool.disabled && setActiveTool(tool.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--s3)',
                padding: '6px var(--s3)',
                borderRadius: 'var(--r-sm)',
                background: activeTool === tool.id ? 'var(--bg-overlay)' : 'transparent',
                border: `1px solid ${activeTool === tool.id ? 'var(--border-subtle)' : 'transparent'}`,
                color: tool.disabled
                  ? 'var(--text-disabled)'
                  : activeTool === tool.id
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
                cursor: tool.disabled ? 'not-allowed' : 'pointer',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-sans)',
                transition: 'all var(--t-fast)',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                if (!tool.disabled && activeTool !== tool.id)
                  e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (activeTool !== tool.id) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ flexShrink: 0 }}>{tool.icon}</span>
              <span style={{ flex: 1 }}>{tool.label}</span>
              {tool.disabled && (
                <span
                  style={{
                    fontSize: 'var(--text-2xs)',
                    color: 'var(--text-disabled)',
                    background: 'var(--bg-overlay)',
                    padding: '1px 5px',
                    borderRadius: 'var(--r-full)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  soon
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 var(--s2)' }} />

      {/* Run history header + search */}
      <div style={{ padding: 'var(--s3) var(--s2) var(--s2)' }}>
        <div
          style={{
            fontSize: 'var(--text-2xs)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-tertiary)',
            letterSpacing: 'var(--tracking-wide)',
            textTransform: 'uppercase',
            padding: '0 var(--s2) var(--s2)',
          }}
        >
          History
        </div>
        <div style={{ position: 'relative' }}>
          <svg
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
          >
            <circle cx="5" cy="5" r="3.5" stroke="var(--text-tertiary)" strokeWidth="1.2" />
            <path
              d="M8 8L10 10"
              stroke="var(--text-tertiary)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search runs…"
            style={{
              width: '100%',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)',
              padding: '4px 8px 4px 24px',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
            }}
          />
        </div>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 4, marginTop: 'var(--s2)', flexWrap: 'wrap' }}>
          {[null, 'running', 'completed', 'failed', 'cancelled'].map((s) => (
            <button
              key={s ?? 'all'}
              onClick={() => setFilterStatus(s)}
              style={{
                fontSize: 'var(--text-2xs)',
                padding: '2px 7px',
                borderRadius: 'var(--r-full)',
                background: filterStatus === s ? 'var(--accent-subtle)' : 'transparent',
                border: `1px solid ${filterStatus === s ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                color: filterStatus === s ? 'var(--accent)' : 'var(--text-tertiary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase',
                transition: 'all var(--t-fast)',
              }}
            >
              {s ?? 'all'}
            </button>
          ))}
        </div>
      </div>

      {/* Run list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 var(--s2) var(--s3)' }}>
        {filteredHistory.length === 0 ? (
          <div
            style={{
              padding: 'var(--s8) var(--s4)',
              textAlign: 'center',
              color: 'var(--text-disabled)',
              fontSize: 'var(--text-xs)',
            }}
          >
            No runs yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {filteredHistory.map((r) => (
              <RunCard
                key={r.id}
                run={r}
                active={activeRunId === r.id}
                onClick={() => onSelectRun(r)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { Sidebar, TOOLS });
