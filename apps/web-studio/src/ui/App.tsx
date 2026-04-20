import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionMeta, SessionStatus } from '../shared/events.ts';
import { api } from './api.ts';
import { HistorySidebar, type HistoryStatusFilter } from './components/HistorySidebar.tsx';
import { PlanApprovalModal } from './components/PlanApprovalModal.tsx';
import { Badge } from './components/primitives.tsx';
import { deriveReportMarkdown } from './components/ReportView.tsx';
import { SessionForm, type SessionFormState } from './components/SessionForm.tsx';
import { SettingsPanel } from './components/SettingsPanel.tsx';
import { StreamView } from './components/StreamView.tsx';
import { Toast, type ToastItem, type ToastType } from './components/Toast.tsx';
import { useEventStream } from './hooks/useEventStream.ts';
import { useSettings } from './hooks/useSettings.ts';

type ViewMode = 'session' | 'settings';

interface HitlModalState {
  open: boolean;
  plan: unknown;
  initialPlan: unknown;
}

function isSameSerializedPlan(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getSessionIdFromHash(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/^#\/sessions\/(.+)$/);
  return match?.[1] ?? null;
}

function setHashSessionId(id: string | null) {
  if (id) {
    window.history.pushState(null, '', `#/sessions/${id}`);
  } else {
    window.history.pushState(null, '', window.location.pathname);
  }
}

export function App() {
  const queryClient = useQueryClient();
  const settingsQuery = useSettings();
  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions({ limit: 200 }),
  });

  const [activeTool, setActiveTool] = useState('deep-research');
  const [view, setView] = useState<ViewMode>('session');
  const [sessionId, setSessionIdState] = useState<string | null>(getSessionIdFromHash);
  const [form, setForm] = useState<SessionFormState>(() => ({
    query: '',
    model: localStorage.getItem('harness:lastModel') ?? '',
  }));
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<HistoryStatusFilter>('all');
  const [hitl, setHitl] = useState<HitlModalState>({
    open: false,
    plan: null,
    initialPlan: null,
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const setSessionId = useCallback((id: string | null) => {
    setSessionIdState(id);
    setHashSessionId(id);
  }, []);

  useEffect(() => {
    localStorage.setItem('harness:lastModel', form.model);
  }, [form.model]);

  useEffect(() => {
    const onHashChange = () => {
      const id = getSessionIdFromHash();
      setSessionIdState(id);
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  const pushToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const stream = useEventStream(sessionId, {
    onHitlRequired: (ev) => {
      setHitl({ open: true, plan: ev.plan, initialPlan: ev.plan });
    },
  });
  const status = stream.status;

  // biome-ignore lint/correctness/useExhaustiveDependencies: stream.events is a mutated ref; status change signals when report becomes available
  const reportMarkdown = useMemo(
    () => deriveReportMarkdown(stream.events),
    [stream.events, status],
  );

  const prevStatusRef = useRef<{ sessionId: string | null; status: SessionStatus | 'idle' }>({
    sessionId: null,
    status: 'idle',
  });

  const submittingRef = useRef(false);
  const streamErrorSeenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!stream.error) {
      return;
    }
    if (streamErrorSeenRef.current === stream.error) {
      return;
    }
    streamErrorSeenRef.current = stream.error;
    pushToast(`Live stream disconnected: ${stream.error}`, 'error');
  }, [stream.error, pushToast]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev.sessionId !== sessionId) {
      streamErrorSeenRef.current = undefined;
      prevStatusRef.current = { sessionId, status };
      return;
    }
    if (prev.status !== status) {
      if (status === 'completed' && (prev.status === 'running' || prev.status === 'pending')) {
        pushToast('Session completed', 'success');
      } else if (status === 'failed') {
        pushToast('Session failed', 'error');
      } else if (
        status === 'cancelled' &&
        (prev.status === 'running' || prev.status === 'pending')
      ) {
        pushToast('Session cancelled', 'info');
      }
    }
    prevStatusRef.current = { sessionId, status };
  }, [sessionId, status, pushToast]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId triggers reset on session change
  useEffect(() => {
    setHitl({ open: false, plan: null, initialPlan: null });
  }, [sessionId]);

  const handleRun = useCallback(async () => {
    if (!form.query.trim() || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      const toolOverrides =
        activeTool === 'deep-research'
          ? (settingsQuery.data?.tools['deep-research']?.values as
              | Record<string, unknown>
              | undefined)
          : undefined;

      const { id } = await api.createSession({
        toolId: activeTool,
        question: form.query,
        settings: {
          ...(toolOverrides ?? {}),
          ...(form.model ? { model: form.model } : {}),
        },
      });
      setSessionId(id);
      setView('session');
      pushToast('Session started', 'info');
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start session';
      pushToast(msg, 'error');
    } finally {
      submittingRef.current = false;
    }
  }, [activeTool, form, pushToast, queryClient, settingsQuery.data?.tools, setSessionId]);

  const handleStop = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    try {
      await api.cancelSession(sessionId);
      pushToast('Stop request sent', 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not cancel session';
      pushToast(msg, 'error');
    }
  }, [sessionId, pushToast]);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await api.deleteSession(id);
        if (sessionId === id) {
          setSessionId(null);
          setForm((prev) => ({ query: '', model: prev.model }));
        }
        await queryClient.invalidateQueries({ queryKey: ['sessions'] });
        pushToast('Session deleted', 'info');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete session';
        pushToast(msg, 'error');
      }
    },
    [sessionId, pushToast, queryClient, setSessionId],
  );

  const handleRetry = useCallback(async () => {
    if (!form.query.trim() || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      const toolOverrides =
        activeTool === 'deep-research'
          ? (settingsQuery.data?.tools['deep-research']?.values as
              | Record<string, unknown>
              | undefined)
          : undefined;

      const { id } = await api.createSession({
        toolId: activeTool,
        question: form.query,
        settings: {
          ...(toolOverrides ?? {}),
          ...(form.model ? { model: form.model } : {}),
        },
      });
      setSessionId(id);
      setView('session');
      pushToast('Retrying session', 'info');
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to retry session';
      pushToast(msg, 'error');
    } finally {
      submittingRef.current = false;
    }
  }, [activeTool, form, pushToast, queryClient, settingsQuery.data?.tools, setSessionId]);

  const handleNewSession = useCallback(() => {
    setSessionId(null);
    setForm((prev) => ({ query: '', model: prev.model }));
    setView('session');
  }, [setSessionId]);

  const handleSelectSession = useCallback(
    (session: SessionMeta) => {
      setSessionId(session.id);
      setActiveTool(session.toolId);
      setForm((prev) => ({ ...prev, query: session.question }));
      setView('session');
    },
    [setSessionId],
  );

  const handleHitlReject = useCallback(async () => {
    if (!sessionId) {
      setHitl({ open: false, plan: null, initialPlan: null });
      return;
    }
    await api.approveSession(sessionId, { decision: 'reject' });
    pushToast('Plan approval rejected', 'info');
    setHitl({ open: false, plan: null, initialPlan: null });
  }, [sessionId, pushToast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && status === 'idle' && form.query.trim()) {
        void handleRun();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [status, form.query, handleRun]);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return;
      }
      if (hitl.open) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void handleHitlReject();
        return;
      }
      if (view === 'settings') {
        e.preventDefault();
        setView('session');
      }
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [handleHitlReject, hitl.open, view]);

  const showStream = Boolean(
    sessionId && (stream.events.length > 0 || stream.status === 'running'),
  );

  useEffect(() => {
    if (!showStream && view !== 'session') {
      setView('session');
    }
  }, [showStream, view]);

  const sessions = sessionsQuery.data?.sessions ?? [];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Toast toasts={toasts} removeToast={removeToast} />
      <PlanApprovalModal
        open={hitl.open}
        plan={hitl.plan}
        onApprove={async (approvedPlan) => {
          if (!sessionId) {
            return;
          }
          await api.approveSession(sessionId, {
            decision: 'approve',
            ...(isSameSerializedPlan(approvedPlan, hitl.initialPlan)
              ? {}
              : { editedPlan: approvedPlan }),
          });
          setHitl({ open: false, plan: null, initialPlan: null });
        }}
        onReject={handleHitlReject}
      />
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
        <HistorySidebar
          sessions={sessions}
          activeSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onDeleteSession={(id) => void handleDeleteSession(id)}
          onNewSession={handleNewSession}
          searchQuery={historySearch}
          setSearchQuery={setHistorySearch}
          filterStatus={historyFilter}
          setFilterStatus={setHistoryFilter}
          activeTool={activeTool}
          onSelectTool={setActiveTool}
        />
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s4)',
            padding: '0 var(--s5)',
            borderBottom: '1px solid var(--border-subtle)',
            height: 'var(--header-h)',
            flexShrink: 0,
            background: 'var(--bg-surface)',
          }}
        >
          <Badge
            variant={
              status === 'running'
                ? 'running'
                : status === 'completed'
                  ? 'success'
                  : status === 'failed'
                    ? 'error'
                    : status === 'cancelled'
                      ? 'cancelled'
                      : 'default'
            }
          >
            {status}
          </Badge>
          <div style={{ flex: 1, minWidth: 0 }}>
            {form.query && (
              <p
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {form.query}
              </p>
            )}
          </div>
          {showStream && (status === 'failed' || status === 'cancelled') && (
            <button
              type="button"
              onClick={() => void handleRetry()}
              style={{
                padding: '3px 10px',
                borderRadius: 'var(--r-sm)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-sans)',
                background: 'var(--accent-subtle)',
                border: '1px solid var(--accent-border)',
                color: 'var(--accent)',
                cursor: 'pointer',
                transition: 'all var(--t-fast)',
              }}
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => setView((v) => (v === 'settings' ? 'session' : 'settings'))}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: view === 'settings' ? 'var(--accent-subtle)' : 'transparent',
              border: `1px solid ${view === 'settings' ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--r-sm)',
              cursor: 'pointer',
              color: view === 'settings' ? 'var(--accent)' : 'var(--text-tertiary)',
              transition: 'all var(--t-fast)',
              fontSize: 'var(--text-sm)',
            }}
          >
            ⚙
          </button>
        </div>

        {view === 'settings' ? (
          <SettingsPanel activeTool={activeTool} />
        ) : showStream ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <SessionForm
              form={form}
              setForm={setForm}
              onRun={handleRun}
              onStop={handleStop}
              status={status}
              compact
            />
            <StreamView
              events={stream.events}
              status={status}
              onRetry={() => void handleRetry()}
              report={reportMarkdown}
            />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <SessionForm
              form={form}
              setForm={setForm}
              onRun={handleRun}
              onStop={handleStop}
              status={status}
            />
            {status === 'idle' && (
              <div
                style={{
                  padding: '0 var(--s5) var(--s8)',
                  textAlign: 'center',
                  color: 'var(--text-disabled)',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 'var(--s3)',
                    padding: 'var(--s8) var(--s10)',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--r-xl)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <p style={{ fontSize: 'var(--text-md)', color: 'var(--text-tertiary)' }}>
                    No active session
                  </p>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-disabled)' }}>
                    Enter a research question above and press Run
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
