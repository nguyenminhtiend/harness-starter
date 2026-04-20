import { useQuery } from '@tanstack/react-query';
import type { SessionStatus } from '../../shared/events.ts';
import { api, type ModelEntry } from '../api.ts';
import { Button } from './primitives.tsx';

export interface SessionFormState {
  query: string;
  model: string;
}

interface SessionFormProps {
  form: SessionFormState;
  setForm: React.Dispatch<React.SetStateAction<SessionFormState>>;
  onRun: () => void;
  onStop: () => void;
  status: SessionStatus | 'idle';
  compact?: boolean;
}

export function SessionForm({ form, setForm, onRun, onStop, status, compact }: SessionFormProps) {
  const running = status === 'running';
  const modelsQuery = useQuery({
    queryKey: ['models'],
    queryFn: () => api.models(),
    staleTime: 60_000,
  });
  const models: ModelEntry[] = modelsQuery.data?.models ?? [];

  if (compact) {
    return (
      <div
        style={{
          padding: 'var(--s3) var(--s5)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          gap: 'var(--s3)',
          alignItems: 'center',
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}
      >
        <textarea
          value={form.query}
          onChange={(e) => setForm((p) => ({ ...p, query: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!running && form.query.trim()) {
                onRun();
              }
            }
          }}
          rows={2}
          disabled={running}
          placeholder="Research question…"
          style={{
            flex: 1,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-sm)',
            padding: 'var(--s2) var(--s3)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)',
            outline: 'none',
            resize: 'none',
            lineHeight: 'var(--leading-normal)',
          }}
        />
        <ModelSelect
          models={models}
          value={form.model}
          onChange={(v) => setForm((p) => ({ ...p, model: v }))}
          disabled={running}
        />
        {running ? (
          <Button variant="danger" size="lg" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={onRun} disabled={!form.query.trim()}>
            Run
            <span style={{ opacity: 0.6, fontSize: 'var(--text-xs)', marginLeft: 'var(--s1)' }}>
              ↵
            </span>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ padding: 'var(--s5)', display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
        <label
          htmlFor="research-query"
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
          id="research-query"
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!running && form.query.trim()) {
                onRun();
              }
            }
          }}
        />
      </div>

      <div
        style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center', marginTop: 'var(--s2)' }}
      >
        <ModelSelect
          models={models}
          value={form.model}
          onChange={(v) => setForm((p) => ({ ...p, model: v }))}
          disabled={running}
        />
        {!running ? (
          <Button
            variant="primary"
            size="lg"
            onClick={onRun}
            disabled={!form.query.trim()}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            Run
            <span style={{ opacity: 0.6, fontSize: 'var(--text-xs)', marginLeft: 'var(--s1)' }}>
              ↵
            </span>
          </Button>
        ) : (
          <Button
            variant="danger"
            size="lg"
            onClick={onStop}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: 'var(--s2) var(--s3)',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-xs)',
  outline: 'none',
  cursor: 'pointer',
  maxWidth: 220,
};

function ModelSelect({
  models,
  value,
  onChange,
  disabled,
}: {
  models: ModelEntry[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const providers = [...new Set(models.map((m) => m.provider))];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={selectStyle}
      title="Select model"
    >
      <option value="">Default model</option>
      {providers.map((p) => (
        <optgroup key={p} label={p}>
          {models
            .filter((m) => m.provider === p)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
