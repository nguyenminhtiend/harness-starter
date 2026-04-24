import type {
  CapabilityDetail,
  CapabilityEntry,
  ConversationMessage,
  ConversationSummary,
  ModelEntry,
  RunSnapshot,
  SessionEvent,
  SettingsResponse,
  SettingsUpdateRequest,
} from '@harness/http/types';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function resolveUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return new URL(path, window.location.origin).href;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return undefined;
}

function normalizeModelEntry(raw: unknown): ModelEntry | null {
  const o = asRecord(raw);
  if (!o) {
    return null;
  }
  const id = typeof o.id === 'string' ? o.id : null;
  if (!id) {
    return null;
  }
  const provider = typeof o.provider === 'string' ? o.provider : '';
  const label =
    typeof o.label === 'string' ? o.label : typeof o.displayName === 'string' ? o.displayName : id;
  return { id, label, provider };
}

function parseModels(body: unknown): ModelEntry[] {
  if (Array.isArray(body)) {
    return body.map(normalizeModelEntry).filter((m): m is ModelEntry => m !== null);
  }
  const o = asRecord(body);
  if (o && Array.isArray(o.models)) {
    return o.models.map(normalizeModelEntry).filter((m): m is ModelEntry => m !== null);
  }
  return [];
}

function normalizeConversationSummary(raw: unknown): ConversationSummary | null {
  const o = asRecord(raw);
  if (!o) {
    return null;
  }
  const conversationId =
    typeof o.conversationId === 'string'
      ? o.conversationId
      : typeof o.id === 'string'
        ? o.id
        : null;
  if (!conversationId) {
    return null;
  }
  const capabilityId = typeof o.capabilityId === 'string' ? o.capabilityId : '';
  const firstMessage = typeof o.firstMessage === 'string' ? o.firstMessage : '';
  const messageCount = typeof o.messageCount === 'number' ? o.messageCount : 0;
  const lastActivityAt = typeof o.lastActivityAt === 'string' ? o.lastActivityAt : '';
  return { conversationId, capabilityId, firstMessage, messageCount, lastActivityAt };
}

function parseConversations(body: unknown): ConversationSummary[] {
  const arr = Array.isArray(body) ? body : asRecord(body)?.conversations;
  if (!Array.isArray(arr)) {
    return [];
  }
  return arr.map(normalizeConversationSummary).filter((c): c is ConversationSummary => c !== null);
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => json<{ status: 'ok' }>('/health'),

  listCapabilities: () => json<CapabilityEntry[]>('/capabilities'),

  getCapability: (id: string) => json<CapabilityDetail>(`/capabilities/${encodeURIComponent(id)}`),

  listModels: async () => {
    const body: unknown = await json<unknown>('/models');
    return { models: parseModels(body) };
  },

  createRun: (body: {
    capabilityId: string;
    input: unknown;
    settings?: unknown;
    conversationId?: string;
  }) =>
    json<{ runId: string }>('/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  listRuns: (params?: { status?: string; capabilityId?: string; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.status) {
      sp.set('status', params.status);
    }
    if (params?.capabilityId) {
      sp.set('capabilityId', params.capabilityId);
    }
    if (params?.limit !== undefined) {
      sp.set('limit', String(params.limit));
    }
    const qs = sp.toString();
    return json<{ runs: RunSnapshot[] }>(`/runs${qs ? `?${qs}` : ''}`);
  },

  getRun: (id: string) => json<RunSnapshot>(`/runs/${encodeURIComponent(id)}`),

  cancelRun: (id: string) =>
    json<{ ok: true }>(`/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),

  deleteRun: (id: string) => json<void>(`/runs/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  approveRun: (runId: string, body: { approvalId: string; editedPlan?: unknown }) =>
    json<{ ok: true }>(`/runs/${encodeURIComponent(runId)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  rejectRun: (runId: string, body: { approvalId: string; reason?: string }) =>
    json<{ ok: true }>(`/runs/${encodeURIComponent(runId)}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  listConversations: async (capabilityId?: string) => {
    const qs = capabilityId ? `?capabilityId=${encodeURIComponent(capabilityId)}` : '';
    const body: unknown = await json<unknown>(`/conversations${qs}`);
    return { conversations: parseConversations(body) };
  },

  getConversationMessages: async (conversationId: string) => {
    const body: unknown = await json<unknown>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    if (Array.isArray(body)) {
      return { conversationId, messages: body as ConversationMessage[] };
    }
    const o = asRecord(body);
    if (o && Array.isArray(o.messages) && typeof o.conversationId === 'string') {
      return {
        conversationId: o.conversationId,
        messages: o.messages as ConversationMessage[],
      };
    }
    if (o && Array.isArray(o.messages)) {
      return { conversationId, messages: o.messages as ConversationMessage[] };
    }
    return { conversationId, messages: [] };
  },

  deleteConversation: (conversationId: string) =>
    json<void>(`/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' }),

  getSettings: (scope?: string) => {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : '';
    return json<SettingsResponse>(`/settings${qs}`);
  },

  updateSettings: (body: SettingsUpdateRequest) =>
    json<SettingsResponse>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

function isTerminalEvent(event: SessionEvent): boolean {
  return (
    event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled'
  );
}

function dispatchSseMessage(
  eventType: string,
  data: string,
  onEvent: (event: SessionEvent) => void,
  safeDone: () => void,
  onError: (err: Error) => void,
): void {
  if (eventType === 'session' && data) {
    try {
      const parsed = JSON.parse(data) as SessionEvent;
      onEvent(parsed);
      if (isTerminalEvent(parsed)) {
        safeDone();
      }
    } catch {
      // Malformed JSON; ignore this event.
    }
    return;
  }
  if (eventType === 'done') {
    safeDone();
    return;
  }
  if (eventType === 'error') {
    if (data) {
      try {
        const parsed = JSON.parse(data) as { message?: unknown };
        const msg = typeof parsed.message === 'string' ? parsed.message : 'SSE stream error';
        onError(new Error(msg));
      } catch {
        onError(new Error('SSE stream error'));
      }
    } else {
      onError(new Error('SSE stream error'));
    }
    safeDone();
  }
}

export function connectSSE(
  runId: string,
  onEvent: (event: SessionEvent) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  lastEventId?: number,
): () => void {
  const url = resolveUrl(`${BASE}/runs/${encodeURIComponent(runId)}/events`);
  const controller = new AbortController();
  let cleanedUp = false;
  let doneCalled = false;

  const safeDone = () => {
    if (doneCalled) {
      return;
    }
    doneCalled = true;
    onDone();
  };

  void (async () => {
    try {
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (lastEventId != null) {
        headers['Last-Event-ID'] = String(lastEventId);
      }
      const res = await fetch(url, { signal: controller.signal, headers });
      if (!res.ok) {
        onError(new Error(`SSE ${res.status}: ${await res.text()}`));
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        onError(new Error('SSE response has no body'));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      const dataLines: string[] = [];

      const flush = () => {
        const data = dataLines.join('\n');
        const type = currentEvent || 'message';
        dispatchSseMessage(type, data, onEvent, safeDone, onError);
        currentEvent = '';
        dataLines.length = 0;
      };

      const processLine = (line: string) => {
        if (line === '') {
          flush();
          return;
        }
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
          return;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      };

      while (!cleanedUp) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.length > 0) {
            for (const line of buffer.split(/\r?\n/)) {
              processLine(line);
            }
          }
          if (currentEvent !== '' || dataLines.length > 0) {
            flush();
          }
          if (!doneCalled) {
            safeDone();
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop() ?? '';
        for (const line of parts) {
          processLine(line);
        }
      }
    } catch (err) {
      if (cleanedUp) {
        return;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return () => {
    cleanedUp = true;
    controller.abort();
  };
}
