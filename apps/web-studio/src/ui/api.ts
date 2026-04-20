import type { RunMeta, UIEvent } from '../shared/events.ts';
import type { SettingsResponse, SettingsUpdateRequest } from '../shared/settings.ts';

const BASE = '/api';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface ToolEntry {
  id: string;
  title: string;
  description: string;
  settingsSchema: Record<string, unknown>;
}

export const api = {
  health: () => json<{ status: string }>('/health'),

  tools: () => json<{ tools: ToolEntry[] }>('/tools'),

  createRun: (body: {
    toolId: string;
    question: string;
    settings?: Record<string, unknown>;
    /** Reserved; server accepts but does not resume yet. */
    resumeRunId?: string;
  }) =>
    json<{ id: string }>('/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  listRuns: (params?: { status?: string; q?: string; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.status) {
      sp.set('status', params.status);
    }
    if (params?.q) {
      sp.set('q', params.q);
    }
    if (params?.limit) {
      sp.set('limit', String(params.limit));
    }
    const qs = sp.toString();
    return json<{ runs: RunMeta[] }>(`/runs${qs ? `?${qs}` : ''}`);
  },

  getRun: (id: string) => json<RunMeta>(`/runs/${id}`),

  cancelRun: (id: string) => json<{ cancelled: boolean }>(`/runs/${id}/cancel`, { method: 'POST' }),

  deleteRun: (id: string) => json<{ ok: boolean }>(`/runs/${id}`, { method: 'DELETE' }),

  approveRun: (id: string, body: { decision: 'approve' | 'reject'; editedPlan?: unknown }) =>
    json<{ ok: boolean }>(`/runs/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  getSettings: () => json<SettingsResponse>('/settings'),

  updateSettings: (body: SettingsUpdateRequest) =>
    json<{ ok: boolean }>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

export function connectSSE(
  runId: string,
  onEvent: (ev: UIEvent) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): () => void {
  const es = new EventSource(`${BASE}/runs/${runId}/events`);
  let closedNormally = false;

  es.addEventListener('event', (e) => {
    try {
      const parsed = JSON.parse(e.data) as UIEvent;
      onEvent(parsed);
    } catch {
      // skip malformed
    }
  });

  es.addEventListener('done', () => {
    closedNormally = true;
    es.close();
    onDone();
  });

  es.onerror = () => {
    es.close();
    if (!closedNormally) {
      onError(new Error('SSE connection lost'));
    }
  };

  return () => es.close();
}
