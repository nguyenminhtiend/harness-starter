import type { ConversationSummary, RunSnapshot, RunStatus } from '@harness/http/types';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api/client.ts';
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
import { useRunMutations } from './hooks/useRunMutations.ts';
import { useRunRouter } from './hooks/useRunRouter.ts';
import { useSettings } from './hooks/useSettings.ts';
import { useToasts } from './hooks/useToasts.ts';

type ViewMode = 'session' | 'settings';

const MODEL_KEY = 'harness:lastModel';

export function App() {
  const settingsQuery = useSettings();
  const runsQuery = useQuery({
    queryKey: ['runs'],
    queryFn: () => api.listRuns({ limit: 200 }),
  });

  const [activeTool, setActiveTool] = useState('deep-research');
  const [view, setView] = useState<ViewMode>('session');
  const { runId, setRunId } = useRunRouter();
  const [form, setForm] = useState<SessionFormState>(() => ({
    query: '',
    model: localStorage.getItem(MODEL_KEY) ?? '',
  }));
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<HistoryStatusFilter>('all');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [convVersion, setConvVersion] = useState(0);
  const { toasts, pushToast, removeToast } = useToasts();
  const { hitl, onApprovalRequested, approve, reject } = useHitlModal(runId, pushToast);

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, form.model);
  }, [form.model]);

  const stream = useEventStream(runId, { onApprovalRequested });
  const status = stream.status;

  const reportMarkdown = useMemo(() => deriveReportMarkdown(stream.events), [stream.events]);

  const mutations = useRunMutations({
    activeTool,
    form,
    settings: settingsQuery.data,
    runId,
    conversationId: activeConversationId,
    setRunId,
    setForm,
    setView: () => setView('session'),
    pushToast,
  });

  useStatusToasts(runId, status, pushToast, stream.error);

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
    setRunId(null);
    setActiveConversationId(null);
    setForm((prev) => ({ query: '', model: prev.model }));
    setView('session');
  }, [setRunId]);

  const handleSelectSession = useCallback(
    (run: RunSnapshot) => {
      setRunId(run.id);
      setActiveTool(run.capabilityId);
      setForm((prev) => ({ ...prev, query: '' }));
      setView('session');
    },
    [setRunId],
  );

  const handleSelectConversation = useCallback((conv: ConversationSummary) => {
    setActiveConversationId(conv.conversationId);
  }, []);

  const handleDeleteConversation = useCallback(
    (convId: string) => {
      void api.deleteConversation(convId).then(() => {
        if (activeConversationId === convId) {
          setActiveConversationId(null);
        }
        setConvVersion((v) => v + 1);
      });
    },
    [activeConversationId],
  );

  const handleConversationCreated = useCallback((convId: string) => {
    setActiveConversationId(convId);
  }, []);

  const handleChatComplete = useCallback(() => {
    setConvVersion((v) => v + 1);
  }, []);

  const showStream = Boolean(
    runId &&
      (stream.events.length > 0 || stream.status === 'running' || stream.status === 'pending'),
  );

  useEffect(() => {
    if (!showStream && view !== 'session') {
      setView('session');
    }
  }, [showStream, view]);

  const runs = runsQuery.data?.runs ?? [];

  const toolSettings = useMemo(
    () =>
      settingsQuery.data?.capabilities?.[activeTool]?.values as Record<string, unknown> | undefined,
    [settingsQuery.data, activeTool],
  );

  const isChat = activeTool === 'simple-chat';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Toast toasts={toasts} removeToast={removeToast} />
      <PlanApprovalModal open={hitl.open} plan={hitl.plan} onApprove={approve} onReject={reject} />
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
            console
          </span>
        </div>
        <HistorySidebar
          sessions={runs}
          activeSessionId={runId}
          onSelectSession={handleSelectSession}
          onDeleteSession={mutations.handleDelete}
          onNewSession={handleNewSession}
          searchQuery={historySearch}
          setSearchQuery={setHistorySearch}
          filterStatus={historyFilter}
          setFilterStatus={setHistoryFilter}
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          conversationVersion={convVersion}
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
        <Header status={status} query={form.query} view={view} setView={setView}>
          {showStream && (status === 'failed' || status === 'cancelled') && (
            <button
              type="button"
              onClick={mutations.handleRetry}
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
          <ChatView
            activeTool={activeTool}
            settings={toolSettings}
            model={form.model || undefined}
            conversationId={activeConversationId ?? null}
            onConversationCreated={handleConversationCreated}
            onNewChat={handleNewSession}
            onComplete={handleChatComplete}
          />
        ) : showStream ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <SessionForm
              form={form}
              setForm={setForm}
              onRun={mutations.handleRun}
              onStop={mutations.handleStop}
              status={status}
              compact
            />
            <StreamView
              events={stream.events}
              status={status}
              onRetry={mutations.handleRetry}
              report={reportMarkdown}
            />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <SessionForm
              form={form}
              setForm={setForm}
              onRun={mutations.handleRun}
              onStop={mutations.handleStop}
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
                    No active run
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

function useStatusToasts(
  runId: string | null,
  status: RunStatus | 'idle',
  pushToast: (msg: string, type: 'info' | 'success' | 'error') => void,
  streamError: string | undefined,
) {
  const prevRef = useRef<{ runId: string | null; status: RunStatus | 'idle' }>({
    runId: null,
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
    if (prev.runId !== runId) {
      seenErrorRef.current = undefined;
      prevRef.current = { runId, status };
      return;
    }
    if (prev.status !== status) {
      if (status === 'completed' && (prev.status === 'running' || prev.status === 'pending')) {
        pushToast('Run completed', 'success');
      } else if (status === 'failed') {
        pushToast('Run failed', 'error');
      } else if (
        status === 'cancelled' &&
        (prev.status === 'running' || prev.status === 'pending')
      ) {
        pushToast('Run cancelled', 'info');
      }
    }
    prevRef.current = { runId, status };
  }, [runId, status, pushToast]);
}

function Header({
  status,
  query,
  view,
  setView,
  children,
}: {
  status: RunStatus | 'idle';
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
          status === 'running' || status === 'pending'
            ? 'running'
            : status === 'completed'
              ? 'success'
              : status === 'failed'
                ? 'error'
                : status === 'cancelled'
                  ? 'cancelled'
                  : status === 'suspended'
                    ? 'accent'
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
        &#9881;
      </button>
    </div>
  );
}
