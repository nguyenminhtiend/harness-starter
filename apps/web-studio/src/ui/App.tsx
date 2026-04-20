import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { RunMeta, RunStatus } from '../shared/events.ts';
import { api } from './api.ts';
import { HistorySidebar, type HistoryStatusFilter } from './components/HistorySidebar.tsx';
import { PlanApprovalModal } from './components/PlanApprovalModal.tsx';
import { Badge, Toast } from './components/primitives.tsx';
import { RunForm, type RunFormState } from './components/RunForm.tsx';
import { SettingsPanel } from './components/SettingsPanel.tsx';
import { StreamView } from './components/StreamView.tsx';
import { useEventStream } from './hooks/useEventStream.ts';
import { useSettings } from './hooks/useSettings.ts';

type ViewMode = 'run' | 'report' | 'settings';

interface HitlModalState {
  open: boolean;
  plan: unknown;
  initialPlan: unknown;
}

function isSameSerializedPlan(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function App() {
  const queryClient = useQueryClient();
  const settingsQuery = useSettings();
  const runsQuery = useQuery({
    queryKey: ['runs'],
    queryFn: () => api.listRuns({ limit: 200 }),
  });

  const [activeTool, setActiveTool] = useState('deep-research');
  const [view, setView] = useState<ViewMode>('run');
  const [runId, setRunId] = useState<string | null>(null);
  const [form, setForm] = useState<RunFormState>({ query: '', model: 'openrouter/free' });
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<HistoryStatusFilter>('all');
  const [hitl, setHitl] = useState<HitlModalState>({
    open: false,
    plan: null,
    initialPlan: null,
  });
  const [toasts, setToasts] = useState<
    { id: string; type: 'error' | 'success' | 'info'; message: string }[]
  >([]);

  const pushToast = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type: 'error', message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const stream = useEventStream(runId, {
    onHitlRequired: (ev) => {
      setHitl({ open: true, plan: ev.plan, initialPlan: ev.plan });
    },
  });
  const status = stream.status;

  // Reset HITL when switching runs; effect body intentionally ignores `runId` values.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runId triggers reset on run change
  useEffect(() => {
    setHitl({ open: false, plan: null, initialPlan: null });
  }, [runId]);

  const handleRun = useCallback(async () => {
    if (!form.query.trim()) {
      return;
    }
    try {
      const toolOverrides =
        activeTool === 'deep-research'
          ? (settingsQuery.data?.tools['deep-research']?.values as
              | Record<string, unknown>
              | undefined)
          : undefined;

      const { id } = await api.createRun({
        toolId: activeTool,
        question: form.query,
        settings: {
          model: form.model,
          ...(toolOverrides ?? {}),
        },
      });
      setRunId(id);
      setView('run');
      await queryClient.invalidateQueries({ queryKey: ['runs'] });
    } catch (err) {
      console.error('Failed to create run:', err);
    }
  }, [activeTool, form, queryClient, settingsQuery.data?.tools]);

  const handleStop = useCallback(async () => {
    if (runId) {
      try {
        await api.cancelRun(runId);
      } catch {
        // run may already be done
      }
    }
  }, [runId]);

  const handleNewRun = useCallback(() => {
    setRunId(null);
    setForm({ query: '', model: form.model });
    setView('run');
  }, [form.model]);

  const handleSelectRun = useCallback((run: RunMeta) => {
    setRunId(run.id);
    setActiveTool(run.toolId);
    setForm((prev) => ({ ...prev, query: run.question }));
    setView('run');
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && status === 'idle' && form.query.trim()) {
        handleRun();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [status, form.query, handleRun]);

  const showStream = Boolean(runId && (stream.events.length > 0 || stream.status === 'running'));

  const runs = runsQuery.data?.runs ?? [];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Toast toasts={toasts} removeToast={removeToast} />
      <PlanApprovalModal
        open={hitl.open}
        plan={hitl.plan}
        onApprove={async (approvedPlan) => {
          if (!runId) {
            return;
          }
          await api.approveRun(runId, {
            decision: 'approve',
            ...(isSameSerializedPlan(approvedPlan, hitl.initialPlan)
              ? {}
              : { editedPlan: approvedPlan }),
          });
          setHitl({ open: false, plan: null, initialPlan: null });
        }}
        onReject={async () => {
          if (!runId) {
            return;
          }
          await api.approveRun(runId, { decision: 'reject' });
          pushToast('Plan approval rejected');
          setHitl({ open: false, plan: null, initialPlan: null });
        }}
      />
      {/* Sidebar */}
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
          runs={runs}
          activeRunId={runId}
          onSelectRun={handleSelectRun}
          onNewRun={handleNewRun}
          searchQuery={historySearch}
          setSearchQuery={setHistorySearch}
          filterStatus={historyFilter}
          setFilterStatus={setHistoryFilter}
          activeTool={activeTool}
          onSelectTool={setActiveTool}
        />
      </div>

      {/* Center */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {/* Top bar */}
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
          {showStream &&
            (status === ('completed' as RunStatus) || status === ('running' as RunStatus)) && (
              <div
                style={{
                  display: 'flex',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--r-sm)',
                  padding: 2,
                  border: '1px solid var(--border-subtle)',
                  gap: 2,
                }}
              >
                {(['run', 'report'] as const).map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setView(v)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 'var(--r-xs)',
                      fontSize: 'var(--text-xs)',
                      background: view === v ? 'var(--bg-overlay)' : 'transparent',
                      border:
                        view === v ? '1px solid var(--border-subtle)' : '1px solid transparent',
                      color: view === v ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                      transition: 'all var(--t-fast)',
                    }}
                  >
                    {v === 'run' ? 'Stream' : 'Report'}
                  </button>
                ))}
              </div>
            )}
          <button
            type="button"
            onClick={() => setView((v) => (v === 'settings' ? 'run' : 'settings'))}
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

        {/* Main content */}
        {view === 'settings' ? (
          <SettingsPanel activeTool={activeTool} />
        ) : showStream ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <RunForm
              form={form}
              setForm={setForm}
              onRun={handleRun}
              onStop={handleStop}
              status={status}
              compact
            />
            <StreamView
              events={stream.events}
              tokens={stream.tokens}
              cost={stream.cost}
              status={status}
              onViewReport={() => setView('report')}
            />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <RunForm
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
