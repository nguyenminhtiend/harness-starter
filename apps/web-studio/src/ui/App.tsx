import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionMeta, SessionStatus } from '../shared/events.ts';
import { api } from './api.ts';
import { ChatView } from './components/ChatView.tsx';
import { HistorySidebar, type HistoryStatusFilter } from './components/HistorySidebar.tsx';
import { PlanApprovalModal } from './components/PlanApprovalModal.tsx';
import { Badge } from './components/primitives.tsx';
import { deriveReportMarkdown } from './components/ReportView.tsx';
import { SessionForm, type SessionFormState } from './components/SessionForm.tsx';
import { SettingsPanel } from './components/SettingsPanel.tsx';
import { StreamView } from './components/StreamView.tsx';
import { Toast } from './components/Toast.tsx';
import { useEventStream } from './hooks/useEventStream.ts';
import { useHitlModal } from './hooks/useHitlModal.ts';
import { useHotkeys } from './hooks/useHotkeys.ts';
import { useSessionMutations } from './hooks/useSessionMutations.ts';
import { useSessionRouter } from './hooks/useSessionRouter.ts';
import { useSettings } from './hooks/useSettings.ts';
import { useToasts } from './hooks/useToasts.ts';

type ViewMode = 'session' | 'settings';

const MODEL_KEY = 'harness:lastModel';

export function App() {
  const settingsQuery = useSettings();
  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions({ limit: 200 }),
  });

  const [activeTool, setActiveTool] = useState('deep-research');
  const [view, setView] = useState<ViewMode>('session');
  const { sessionId, setSessionId } = useSessionRouter();
  const [form, setForm] = useState<SessionFormState>(() => ({
    query: '',
    model: localStorage.getItem(MODEL_KEY) ?? '',
  }));
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<HistoryStatusFilter>('all');
  const { toasts, pushToast, removeToast } = useToasts();
  const { hitl, onHitlRequired, approve, reject } = useHitlModal(sessionId, pushToast);

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, form.model);
  }, [form.model]);

  const stream = useEventStream(sessionId, { onHitlRequired });
  const status = stream.status;

  const reportMarkdown = useMemo(() => deriveReportMarkdown(stream.events), [stream.events]);

  const mutations = useSessionMutations({
    activeTool,
    form,
    settings: settingsQuery.data,
    sessionId,
    setSessionId,
    setForm,
    setView: () => setView('session'),
    pushToast,
  });

  useStatusToasts(sessionId, status, pushToast, stream.error);

  useHotkeys({
    status,
    query: form.query,
    onRun: mutations.handleRun,
    onEscapeHitl: reject,
    hitlOpen: hitl.open,
    view,
    setView: () => setView('session'),
  });

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
      <PlanApprovalModal open={hitl.open} plan={hitl.plan} onApprove={approve} onReject={reject} />
      <Sidebar
        sessions={sessions}
        activeSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={mutations.handleDelete}
        onNewSession={handleNewSession}
        historySearch={historySearch}
        setHistorySearch={setHistorySearch}
        historyFilter={historyFilter}
        setHistoryFilter={setHistoryFilter}
        activeTool={activeTool}
        onSelectTool={setActiveTool}
      />
      <MainPane
        view={view}
        setView={setView}
        status={status}
        form={form}
        setForm={setForm}
        showStream={showStream}
        stream={stream}
        reportMarkdown={reportMarkdown}
        activeTool={activeTool}
        settings={settingsQuery.data}
        onRun={mutations.handleRun}
        onStop={mutations.handleStop}
        onRetry={mutations.handleRetry}
      />
    </div>
  );
}

function useStatusToasts(
  sessionId: string | null,
  status: SessionStatus | 'idle',
  pushToast: (msg: string, type: 'info' | 'success' | 'error') => void,
  streamError: string | undefined,
) {
  const prevRef = useRef<{ sessionId: string | null; status: SessionStatus | 'idle' }>({
    sessionId: null,
    status: 'idle',
  });
  const seenErrorRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (streamError && seenErrorRef.current !== streamError) {
      seenErrorRef.current = streamError;
      pushToast(`Live stream disconnected: ${streamError}`, 'error');
    }
  }, [streamError, pushToast]);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev.sessionId !== sessionId) {
      seenErrorRef.current = undefined;
      prevRef.current = { sessionId, status };
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
    prevRef.current = { sessionId, status };
  }, [sessionId, status, pushToast]);
}

interface SidebarProps {
  sessions: SessionMeta[];
  activeSessionId: string | null;
  onSelectSession: (s: SessionMeta) => void;
  onDeleteSession: (id: string) => void;
  onNewSession: () => void;
  historySearch: string;
  setHistorySearch: (q: string) => void;
  historyFilter: HistoryStatusFilter;
  setHistoryFilter: (f: HistoryStatusFilter) => void;
  activeTool: string;
  onSelectTool: (t: string) => void;
}

function Sidebar(props: SidebarProps) {
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
        sessions={props.sessions}
        activeSessionId={props.activeSessionId}
        onSelectSession={props.onSelectSession}
        onDeleteSession={props.onDeleteSession}
        onNewSession={props.onNewSession}
        searchQuery={props.historySearch}
        setSearchQuery={props.setHistorySearch}
        filterStatus={props.historyFilter}
        setFilterStatus={props.setHistoryFilter}
        activeTool={props.activeTool}
        onSelectTool={props.onSelectTool}
      />
    </div>
  );
}

interface MainPaneProps {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  status: SessionStatus | 'idle';
  form: SessionFormState;
  setForm: React.Dispatch<React.SetStateAction<SessionFormState>>;
  showStream: boolean;
  stream: { events: readonly import('../shared/events.ts').UIEvent[] };
  reportMarkdown: string | undefined;
  activeTool: string;
  settings?: import('../shared/settings.ts').SettingsResponse | undefined;
  onRun: () => void;
  onStop: () => void;
  onRetry: () => void;
}

function MainPane({
  view,
  setView,
  status,
  form,
  setForm,
  showStream,
  stream,
  reportMarkdown,
  activeTool,
  settings,
  onRun,
  onStop,
  onRetry,
}: MainPaneProps) {
  const isChat = activeTool === 'simple-chat';
  const toolSettings = useMemo(
    () => settings?.tools[activeTool]?.values as Record<string, unknown> | undefined,
    [settings, activeTool],
  );
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <Header status={status} query={form.query} view={view} setView={setView}>
        {showStream && (status === 'failed' || status === 'cancelled') && (
          <button
            type="button"
            onClick={onRetry}
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
      </Header>

      {view === 'settings' ? (
        <SettingsPanel activeTool={activeTool} />
      ) : isChat ? (
        <ChatView activeTool={activeTool} settings={toolSettings} model={form.model || undefined} />
      ) : showStream ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <SessionForm
            form={form}
            setForm={setForm}
            onRun={onRun}
            onStop={onStop}
            status={status}
            compact
          />
          <StreamView
            events={stream.events}
            status={status}
            onRetry={onRetry}
            report={reportMarkdown}
          />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <SessionForm
            form={form}
            setForm={setForm}
            onRun={onRun}
            onStop={onStop}
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
  );
}

function Header({
  status,
  query,
  view,
  setView,
  children,
}: {
  status: SessionStatus | 'idle';
  query: string;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  children?: React.ReactNode;
}) {
  return (
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
      {children}
      <button
        type="button"
        onClick={() => setView(view === 'settings' ? 'session' : 'settings')}
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
  );
}
