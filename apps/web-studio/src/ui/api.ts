import type { SessionMeta, UIEvent } from '../shared/events.ts';
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

export interface ModelEntry {
  id: string;
  label: string;
  provider: string;
}

export interface ConversationSummary {
  conversationId: string;
  toolId: string;
  firstQuestion: string;
  messageCount: number;
  lastActivityAt: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  sessionId: string;
}

export const api = {
  health: () => json<{ status: string }>('/health'),

  tools: () => json<{ tools: ToolEntry[] }>('/tools'),

  models: () => json<{ models: ModelEntry[] }>('/models'),

  createSession: (body: {
    toolId: string;
    question: string;
    settings?: Record<string, unknown>;
    resumeSessionId?: string;
    conversationId?: string;
  }) =>
    json<{ id: string }>('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  listSessions: (params?: { status?: string; q?: string; limit?: number }) => {
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
    return json<{ sessions: SessionMeta[] }>(`/sessions${qs ? `?${qs}` : ''}`);
  },

  getSession: (id: string) => json<SessionMeta>(`/sessions/${id}`),

  cancelSession: (id: string) =>
    json<{ cancelled: boolean }>(`/sessions/${id}/cancel`, { method: 'POST' }),

  deleteSession: (id: string) => json<{ ok: boolean }>(`/sessions/${id}`, { method: 'DELETE' }),

  approveSession: (id: string, body: { decision: 'approve' | 'reject'; editedPlan?: unknown }) =>
    json<{ ok: boolean }>(`/sessions/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  listConversations: (toolId?: string) => {
    const qs = toolId ? `?toolId=${encodeURIComponent(toolId)}` : '';
    return json<{ conversations: ConversationSummary[] }>(`/sessions/conversations/list${qs}`);
  },

  getConversationMessages: (conversationId: string) =>
    json<{ conversationId: string; messages: ConversationMessage[] }>(
      `/sessions/conversations/${conversationId}/messages`,
    ),

  deleteConversation: (conversationId: string) =>
    json<{ ok: boolean }>(`/sessions/conversations/${conversationId}`, { method: 'DELETE' }),

  getSettings: () => json<SettingsResponse>('/settings'),

  updateSettings: (body: SettingsUpdateRequest) =>
    json<{ ok: boolean }>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

export function connectSSE(
  sessionId: string,
  onEvent: (ev: UIEvent) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): () => void {
  const es = new EventSource(`${BASE}/sessions/${sessionId}/events`);
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
