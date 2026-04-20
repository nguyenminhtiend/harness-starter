import type { RunStatus } from '../../shared/events.ts';
import { Button } from './primitives.tsx';

export interface RunFormState {
  query: string;
  model: string;
}

interface RunFormProps {
  form: RunFormState;
  setForm: React.Dispatch<React.SetStateAction<RunFormState>>;
  onRun: () => void;
  onStop: () => void;
  status: RunStatus | 'idle';
  compact?: boolean;
}

export function RunForm({ form, setForm, onRun, onStop, status, compact }: RunFormProps) {
  const running = status === 'running';

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
        {running ? (
          <Button variant="danger" size="md" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button variant="primary" size="md" onClick={onRun} disabled={!form.query.trim()}>
            Run
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
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !running) {
              onRun();
            }
          }}
        />
      </div>

      <div
        style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center', marginTop: 'var(--s2)' }}
      >
        {!running ? (
          <Button
            variant="primary"
            size="xl"
            onClick={onRun}
            disabled={!form.query.trim()}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            Run
            <span style={{ opacity: 0.6, fontSize: 'var(--text-xs)', marginLeft: 'var(--s1)' }}>
              ⌘↵
            </span>
          </Button>
        ) : (
          <Button
            variant="danger"
            size="xl"
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
