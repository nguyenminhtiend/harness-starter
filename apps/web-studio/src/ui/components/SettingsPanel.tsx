import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiKeyMask } from '../../shared/settings.ts';
import { api } from '../api.ts';
import { useSettings } from '../hooks/useSettings.ts';
import { Badge } from './primitives.tsx';

type TabId = 'tool' | 'prompts' | 'keys' | 'global';

const PROMPT_FIELDS = ['plannerPrompt', 'writerPrompt', 'factCheckerPrompt'] as const;

const PROMPT_LABELS: Record<(typeof PROMPT_FIELDS)[number], string> = {
  plannerPrompt: 'Planner system prompt',
  writerPrompt: 'Writer system prompt',
  factCheckerPrompt: 'Fact checker system prompt',
};

function jsonSchemaProps(
  schema: Record<string, unknown>,
): Record<string, Record<string, unknown>> | undefined {
  if (schema.type !== 'object') {
    return undefined;
  }
  const props = schema.properties;
  if (!props || typeof props !== 'object') {
    return undefined;
  }
  return props as Record<string, Record<string, unknown>>;
}

function propSchemaType(prop: Record<string, unknown>): string | undefined {
  const t = prop.type;
  if (typeof t === 'string') {
    return t;
  }
  if (Array.isArray(t)) {
    const first = t.find((x) => x !== 'null');
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

function isApiKeyField(key: string): boolean {
  return key.endsWith('ApiKey');
}

function isPromptField(key: string): boolean {
  return key.endsWith('Prompt');
}

const tabStyle = (active: boolean): CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 'var(--r-sm)',
  fontSize: 'var(--text-xs)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
  border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
  background: active ? 'var(--accent-subtle)' : 'transparent',
  color: active ? 'var(--accent)' : 'var(--text-secondary)',
  transition: 'all var(--t-fast)',
});

const fieldLabelStyle: CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-medium)',
  color: 'var(--text-secondary)',
  letterSpacing: 'var(--tracking-wide)',
  textTransform: 'uppercase',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--s2)',
};

export interface SettingsPanelProps {
  activeTool: string;
}

export function SettingsPanel({ activeTool }: SettingsPanelProps) {
  const [tab, setTab] = useState<TabId>('tool');
  const toolsQuery = useQuery({
    queryKey: ['studio-tools'],
    queryFn: () => api.tools(),
  });
  const { data, isLoading, error, schedulePatch, saveFlash, isSaving, flushPending } =
    useSettings();

  useEffect(() => {
    return () => {
      void flushPending();
    };
  }, [flushPending]);

  const activeToolDef = useMemo(() => {
    const list = toolsQuery.data?.tools ?? [];
    return list.find((t) => t.id === activeTool);
  }, [toolsQuery.data?.tools, activeTool]);

  const toolView = data?.tools[activeTool];
  const values = toolView?.values ?? {};
  const inherited = toolView?.inheritedFromGlobal ?? {};

  const onToolField = useCallback(
    (key: string, value: unknown) => {
      schedulePatch(activeTool, { [key]: value });
    },
    [activeTool, schedulePatch],
  );

  const onGlobalField = useCallback(
    (patch: Record<string, unknown>) => {
      schedulePatch('global', patch);
    },
    [schedulePatch],
  );

  const renderSchemaField = (key: string, prop: Record<string, unknown>) => {
    if (isPromptField(key) || isApiKeyField(key)) {
      return null;
    }
    const st = propSchemaType(prop);
    const rawDef = prop.default;
    const inheritedHere = inherited[key] === true;
    const current = values[key] ?? rawDef;

    if (Array.isArray(prop.enum) && prop.enum.every((x) => typeof x === 'string')) {
      const options = prop.enum as string[];
      return (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
          <span style={fieldLabelStyle}>
            {key}
            {inheritedHere ? (
              <Badge variant="default" style={{ textTransform: 'none' }}>
                inherited
              </Badge>
            ) : null}
          </span>
          <select
            value={typeof current === 'string' ? current : String(options[0] ?? '')}
            onChange={(e) => {
              onToolField(key, e.target.value);
            }}
            style={{
              padding: 'var(--s2) var(--s3)',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (st === 'boolean') {
      const checked = Boolean(current);
      return (
        <div
          key={key}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span style={fieldLabelStyle}>
            {key}
            {inheritedHere ? (
              <Badge variant="default" style={{ textTransform: 'none' }}>
                inherited
              </Badge>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() => {
              onToolField(key, !checked);
            }}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              border: '1px solid var(--border-subtle)',
              background: checked ? 'var(--accent)' : 'var(--bg-elevated)',
              cursor: 'pointer',
              position: 'relative',
            }}
            aria-pressed={checked}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: checked ? 22 : 2,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left var(--t-fast)',
              }}
            />
          </button>
        </div>
      );
    }

    if (st === 'number') {
      const min = typeof prop.minimum === 'number' ? prop.minimum : undefined;
      const max = typeof prop.maximum === 'number' ? prop.maximum : undefined;
      const num = typeof current === 'number' ? current : Number(current ?? 0);
      return (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
          <span style={fieldLabelStyle}>
            {key}
            {inheritedHere ? (
              <Badge variant="default" style={{ textTransform: 'none' }}>
                inherited
              </Badge>
            ) : null}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
            {min !== undefined && max !== undefined ? (
              <input
                type="range"
                min={min}
                max={max}
                step={key === 'maxTokens' ? 1000 : 1}
                value={Number.isFinite(num) ? num : min}
                onChange={(e) => {
                  onToolField(key, Number(e.target.value));
                }}
                style={{ flex: 1 }}
              />
            ) : null}
            <input
              type="number"
              value={Number.isFinite(num) ? num : ''}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v)) {
                  onToolField(key, v);
                }
              }}
              style={{
                width: 120,
                padding: 'var(--s2)',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
              }}
            />
          </div>
        </div>
      );
    }

    if (st === 'string') {
      const str = typeof current === 'string' ? current : '';
      return (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
          <span style={fieldLabelStyle}>
            {key}
            {inheritedHere ? (
              <Badge variant="default" style={{ textTransform: 'none' }}>
                inherited
              </Badge>
            ) : null}
          </span>
          <input
            type="text"
            value={str}
            onChange={(e) => {
              onToolField(key, e.target.value);
            }}
            style={{
              padding: 'var(--s2) var(--s3)',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-sm)',
            }}
          />
        </div>
      );
    }

    return null;
  };

  // `settingsSchema` comes from GET /api/tools (`z.toJSONSchema(toolDef.settingsSchema)` on the server).
  const schemaRoot = activeToolDef?.settingsSchema as Record<string, unknown> | undefined;
  const properties = schemaRoot ? jsonSchemaProps(schemaRoot) : undefined;

  if (isLoading || toolsQuery.isLoading) {
    return (
      <div style={{ padding: 'var(--s5)', color: 'var(--text-tertiary)' }}>Loading settings…</div>
    );
  }

  if (error || toolsQuery.error) {
    return (
      <div style={{ padding: 'var(--s5)', color: 'var(--status-error)' }}>
        Failed to load settings
      </div>
    );
  }

  if (!data || !activeToolDef) {
    return (
      <div style={{ padding: 'var(--s5)', color: 'var(--text-tertiary)' }}>No tool selected.</div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--s5) var(--s3)',
          borderBottom: '1px solid var(--border-subtle)',
          gap: 'var(--s4)',
        }}
      >
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(
            [
              ['tool', 'Tool'],
              ['prompts', 'Prompts'],
              ['keys', 'API Keys'],
              ['global', 'Global'],
            ] as const
          ).map(([id, label]) => (
            <button
              type="button"
              key={id}
              onClick={() => {
                setTab(id);
              }}
              style={tabStyle(tab === id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', minHeight: 28 }}>
          {isSaving ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Saving…
            </span>
          ) : null}
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
              color: saveFlash ? 'var(--status-success)' : 'transparent',
              opacity: saveFlash ? 1 : 0,
              transform: saveFlash ? 'translateY(0)' : 'translateY(4px)',
              transition: 'opacity 0.35s ease, transform 0.35s ease, color 0.35s ease',
            }}
          >
            Saved
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s5)' }}>
        {tab === 'tool' && properties ? (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)', maxWidth: 560 }}
          >
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
              Settings for <strong>{activeToolDef.title}</strong> (from tool schema). Changes save
              automatically.
            </p>
            {Object.entries(properties).map(([key, prop]) => {
              if (typeof prop !== 'object' || prop === null) {
                return null;
              }
              return renderSchemaField(key, prop as Record<string, unknown>);
            })}
          </div>
        ) : null}

        {tab === 'prompts' ? (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)', maxWidth: 720 }}
          >
            {PROMPT_FIELDS.map((field) => {
              const text = typeof values[field] === 'string' ? (values[field] as string) : '';
              return (
                <div
                  key={field}
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={fieldLabelStyle}>{PROMPT_LABELS[field]}</span>
                    <button
                      type="button"
                      onClick={() => {
                        onToolField(field, '');
                      }}
                      style={{
                        fontSize: 'var(--text-xs)',
                        padding: '4px 10px',
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      Restore default
                    </button>
                  </div>
                  <textarea
                    value={text}
                    rows={8}
                    onChange={(e) => {
                      onToolField(field, e.target.value);
                    }}
                    placeholder="Leave empty to use the built-in default prompt."
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      padding: 'var(--s3)',
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-sm)',
                      lineHeight: 'var(--leading-normal)',
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : null}

        {tab === 'keys' ? (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)', maxWidth: 480 }}
          >
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
              Secrets are stored on the server and never sent back to the browser.
            </p>
            {Object.keys(values)
              .filter((k) => isApiKeyField(k))
              .map((key) => {
                const mask = values[key] as ApiKeyMask | unknown;
                const set = Boolean(
                  mask && typeof mask === 'object' && 'set' in mask && (mask as ApiKeyMask).set,
                );
                return (
                  <div
                    key={key}
                    style={{
                      padding: 'var(--s4)',
                      borderRadius: 'var(--r-md)',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-surface)',
                    }}
                  >
                    <div style={fieldLabelStyle}>{key}</div>
                    <p style={{ margin: 'var(--s2) 0', fontSize: 'var(--text-sm)' }}>
                      Status:{' '}
                      <Badge variant={set ? 'success' : 'default'}>{set ? 'Set' : 'Not set'}</Badge>
                    </p>
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={set ? 'Enter a new key to replace' : 'Paste API key'}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v.length > 0) {
                          onToolField(key, v);
                        }
                      }}
                      style={{
                        width: '100%',
                        marginTop: 'var(--s2)',
                        padding: 'var(--s2) var(--s3)',
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-sm)',
                      }}
                    />
                  </div>
                );
              })}
          </div>
        ) : null}

        {tab === 'global' ? (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)', maxWidth: 480 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
              <span style={fieldLabelStyle}>model</span>
              <input
                type="text"
                value={data.global.defaultModel}
                onChange={(e) => {
                  onGlobalField({ defaultModel: e.target.value });
                }}
                style={{
                  padding: 'var(--s2) var(--s3)',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
              <span style={fieldLabelStyle}>budgetUsd</span>
              <input
                type="number"
                step="0.01"
                value={data.global.budgetUsd}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) {
                    onGlobalField({ budgetUsd: v });
                  }
                }}
                style={{
                  padding: 'var(--s2) var(--s3)',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
              <span style={fieldLabelStyle}>budgetTokens (token cap)</span>
              <input
                type="range"
                min={10_000}
                max={1_000_000}
                step={1000}
                value={data.global.budgetTokens}
                onChange={(e) => {
                  onGlobalField({ budgetTokens: Number(e.target.value) });
                }}
              />
              <input
                type="number"
                value={data.global.budgetTokens}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) {
                    onGlobalField({ budgetTokens: v });
                  }
                }}
                style={{
                  padding: 'var(--s2) var(--s3)',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
              <span style={fieldLabelStyle}>concurrency</span>
              <input
                type="range"
                min={1}
                max={16}
                step={1}
                value={data.global.concurrency}
                onChange={(e) => {
                  onGlobalField({ concurrency: Number(e.target.value) });
                }}
              />
              <input
                type="number"
                value={data.global.concurrency}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) {
                    onGlobalField({ concurrency: Math.round(v) });
                  }
                }}
                style={{
                  padding: 'var(--s2) var(--s3)',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
