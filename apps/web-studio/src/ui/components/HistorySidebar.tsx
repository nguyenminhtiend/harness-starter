import { useMemo } from 'react';
import type { SessionMeta } from '../../shared/events.ts';

import { ToolPicker } from './ToolPicker.tsx';

export type HistoryStatusFilter = 'all' | 'running' | 'completed' | 'failed' | 'cancelled';

const STATUS_FILTERS: HistoryStatusFilter[] = [
  'all',
  'running',
  'completed',
  'failed',
  'cancelled',
];

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 45) {
    return 'just now';
  }
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) {
    return `${diffHr}h ago`;
  }
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 14) {
    return `${diffDay}d ago`;
  }
  return new Date(iso).toLocaleDateString();
}

function statusDotColor(status: SessionMeta['status']): string {
  switch (status) {
    case 'running':
      return 'var(--status-running)';
    case 'completed':
      return 'var(--status-success)';
    case 'failed':
      return 'var(--status-error)';
    case 'cancelled':
      return 'var(--status-cancelled)';
    default:
      return 'var(--text-disabled)';
  }
}

export interface HistorySidebarProps {
  sessions: SessionMeta[];
  activeSessionId: string | null;
  onSelectSession: (session: SessionMeta) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewSession: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterStatus: HistoryStatusFilter;
  setFilterStatus: (s: HistoryStatusFilter) => void;
  activeTool: string;
  onSelectTool: (id: string) => void;
}

export function HistorySidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onNewSession,
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
  activeTool,
  onSelectTool,
}: HistorySidebarProps) {
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filterStatus !== 'all' && s.status !== filterStatus) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        s.question.toLowerCase().includes(q) ||
        s.toolId.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });
  }, [sessions, searchQuery, filterStatus]);

  return (
    <>
      <ToolPicker activeTool={activeTool} onSelect={onSelectTool} />
      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 var(--s2)' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: 'var(--s3) var(--s2) var(--s2)', flexShrink: 0 }}>
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
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
            }}
            placeholder="Search sessions…"
            aria-label="Search sessions"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '6px var(--s3)',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-sans)',
            }}
          />
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 'var(--s2)',
            }}
          >
            {STATUS_FILTERS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => {
                  setFilterStatus(s);
                }}
                style={{
                  padding: '3px 8px',
                  borderRadius: 'var(--r-full)',
                  fontSize: 'var(--text-2xs)',
                  fontFamily: 'var(--font-sans)',
                  border:
                    filterStatus === s
                      ? '1px solid var(--accent-border)'
                      : '1px solid var(--border-subtle)',
                  background: filterStatus === s ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                  color: filterStatus === s ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, padding: '0 var(--s2) var(--s3)', overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: 'var(--s4)',
                textAlign: 'center',
                color: 'var(--text-disabled)',
                fontSize: 'var(--text-xs)',
              }}
            >
              No sessions match
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map((session) => {
                const active = session.id === activeSessionId;
                return (
                  <button
                    type="button"
                    key={session.id}
                    onClick={() => {
                      onSelectSession(session);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: 'var(--s3)',
                      borderRadius: 'var(--r-sm)',
                      border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                      background: active ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                      cursor: 'pointer',
                      transition: 'all var(--t-fast)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: statusDotColor(session.status),
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 'var(--text-2xs)',
                          color: 'var(--text-tertiary)',
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {session.toolId}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-disabled)' }}>
                        {formatRelativeTime(session.createdAt)}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-primary)',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {session.question}
                    </p>
                    <div
                      style={{
                        marginTop: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(session.id);
                        }}
                        style={{
                          fontSize: 'var(--text-2xs)',
                          color: 'var(--text-disabled)',
                          cursor: 'pointer',
                          padding: '0 4px',
                          borderRadius: 'var(--r-xs)',
                          transition: 'color var(--t-fast)',
                          lineHeight: 1,
                          background: 'none',
                          border: 'none',
                          fontFamily: 'inherit',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color =
                            'var(--status-error)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color =
                            'var(--text-disabled)';
                        }}
                        aria-label="Delete session"
                      >
                        ✕
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: 'var(--s3) var(--s2)', borderTop: '1px solid var(--border-subtle)' }}>
        <button
          type="button"
          onClick={onNewSession}
          style={{
            width: '100%',
            padding: '6px var(--s3)',
            borderRadius: 'var(--r-sm)',
            background: 'var(--accent-subtle)',
            border: '1px solid var(--accent-border)',
            color: 'var(--accent)',
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
            transition: 'all var(--t-fast)',
          }}
        >
          New session
        </button>
      </div>
    </>
  );
}
