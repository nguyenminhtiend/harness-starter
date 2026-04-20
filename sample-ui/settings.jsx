// settings.jsx — Settings Modal (opens on demand)

const GLOBAL_DEFAULTS = {
  model: 'claude-opus-4-5',
  maxTokens: 100000,
  budgetUsd: 10,
  concurrency: 3,
  plannerPrompt: `You are a strategic research planner. Break the user's query into precise, non-overlapping sub-questions that together form a complete answer. Be thorough but efficient.`,
  researcherPrompt: `You are an expert researcher. For each sub-question, search the web and synthesize accurate, cited information. Prefer primary sources and recent data.`,
  writerPrompt: `You are a skilled technical writer. Synthesize research findings into a comprehensive, well-structured markdown report with clear sections, citations, and a summary.`,
  factCheckerPrompt: `You are a rigorous fact-checker. Verify each key claim against the sources. Flag anything uncertain, contradictory, or unsupported.`,
};

const TOOL_SCHEMA = {
  'deep-research': [
    {
      key: 'model',
      label: 'Model',
      type: 'select',
      options: [
        { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
        { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
        { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      ],
    },
    {
      key: 'depth',
      label: 'Search Depth',
      type: 'slider',
      min: 1,
      max: 5,
      step: 1,
      hint: 'Iterations per sub-question',
    },
    { key: 'maxTokens', label: 'Token Cap', type: 'number', hint: 'Max tokens across full run' },
    { key: 'budgetUsd', label: 'Budget (USD)', type: 'number', hint: 'Hard spending limit' },
    {
      key: 'concurrency',
      label: 'Parallel Researchers',
      type: 'slider',
      min: 1,
      max: 8,
      step: 1,
      hint: 'Simultaneous researcher agents',
    },
    {
      key: 'ephemeral',
      label: 'Ephemeral Mode',
      type: 'toggle',
      hint: 'Discard run data after completion',
    },
    { key: 'hitl', label: 'Human-in-the-Loop', type: 'toggle', hint: 'Pause for plan approval' },
  ],
};

const PROMPT_FIELDS = [
  { key: 'plannerPrompt', label: 'Planner' },
  { key: 'researcherPrompt', label: 'Researcher' },
  { key: 'writerPrompt', label: 'Writer' },
  { key: 'factCheckerPrompt', label: 'Fact-Checker' },
];

const API_KEY_IDS = [
  { key: 'openaiKey', label: 'OpenAI API Key' },
  { key: 'tavilyKey', label: 'Tavily Search Key' },
];

const SavedPill = ({ show }) => (
  <span
    style={{
      fontSize: 'var(--text-2xs)',
      color: 'var(--status-success)',
      background: 'var(--status-success-subtle)',
      border: '1px solid oklch(70% 0.15 148 / 0.25)',
      borderRadius: 'var(--r-full)',
      padding: '1px 7px',
      letterSpacing: 'var(--tracking-wide)',
      textTransform: 'uppercase',
      opacity: show ? 1 : 0,
      transition: 'opacity 0.4s ease',
    }}
  >
    saved
  </span>
);

const ApiKeyField = ({ label, keyId }) => {
  const [isSet, setIsSet] = React.useState(() => !!localStorage.getItem(`ws_key_${keyId}`));
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState('');
  const handleSave = () => {
    if (val.trim()) {
      localStorage.setItem(`ws_key_${keyId}`, val.trim());
      setIsSet(true);
      setEditing(false);
      setVal('');
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
      <label
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 'var(--weight-medium)',
          color: 'var(--text-secondary)',
          letterSpacing: 'var(--tracking-wide)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </label>
      {editing ? (
        <div style={{ display: 'flex', gap: 'var(--s2)' }}>
          <input
            type="password"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="sk-…"
            autoFocus
            style={{
              flex: 1,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--accent-border)',
              borderRadius: 'var(--r-sm)',
              padding: '5px 9px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              outline: 'none',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s2)',
            padding: '5px 9px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-sm)',
          }}
        >
          <span
            style={{
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: isSet ? 'var(--status-success)' : 'var(--text-disabled)',
            }}
          >
            {isSet ? '●●●●●●●●●●●●●●●●' : 'not set'}
          </span>
          <button
            onClick={() => setEditing(true)}
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {isSet ? 'replace' : 'set'}
          </button>
        </div>
      )}
    </div>
  );
};

const TABS = [
  { id: 'tool', label: 'Tool' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'keys', label: 'API Keys' },
  { id: 'global', label: 'Global' },
];

const SettingsPanel = ({
  open,
  onClose,
  activeTool,
  toolSettings,
  setToolSettings,
  globalSettings,
  setGlobalSettings,
}) => {
  const [savedAnim, setSavedAnim] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('tool');
  const schema = TOOL_SCHEMA[activeTool] || [];

  const triggerSaved = () => {
    setSavedAnim(false);
    setTimeout(() => setSavedAnim(true), 10);
    setTimeout(() => setSavedAnim(false), 2000);
  };

  const handleToolChange = (key, val) => {
    setToolSettings((p) => ({ ...p, [key]: val }));
    triggerSaved();
  };
  const handleGlobalChange = (key, val) => {
    setGlobalSettings((p) => ({ ...p, [key]: val }));
    triggerSaved();
  };

  const getVal = (key) =>
    toolSettings[key] !== undefined ? toolSettings[key] : globalSettings[key];
  const isInherited = (key) => toolSettings[key] === undefined && key in globalSettings;

  const renderField = (field) => {
    const val = getVal(field.key);
    const inh = isInherited(field.key);
    const onChange = (v) => handleToolChange(field.key, v);

    if (field.type === 'select')
      return (
        <SelectField
          key={field.key}
          label={field.label}
          value={val}
          inherited={inh}
          onChange={(e) => onChange(e.target.value)}
          options={field.options}
          hint={field.hint}
        />
      );
    if (field.type === 'slider')
      return (
        <Slider
          key={field.key}
          label={field.label}
          value={val ?? field.min}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={onChange}
          hint={field.hint}
        />
      );
    if (field.type === 'toggle')
      return (
        <Toggle
          key={field.key}
          label={field.label}
          checked={!!val}
          onChange={onChange}
          hint={field.hint}
        />
      );
    if (field.type === 'number')
      return (
        <Input
          key={field.key}
          label={field.label}
          type="number"
          value={val ?? ''}
          inherited={inh}
          onChange={(e) => onChange(Number(e.target.value))}
          hint={field.hint}
        />
      );
    return null;
  };

  if (!open) return null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 var(--s5)',
            borderBottom: '1px solid var(--border-subtle)',
            height: 'var(--header-h)',
            flexShrink: 0,
            background: 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
            <button
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--s2)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-sm)',
                padding: 0,
                fontFamily: 'var(--font-sans)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M8 2L4 6L8 10"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Back
            </button>
            <div style={{ width: 1, height: 14, background: 'var(--border-subtle)' }} />
            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-primary)',
              }}
            >
              Settings
            </span>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
                background: 'var(--bg-overlay)',
                padding: '2px 8px',
                borderRadius: 'var(--r-full)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {TOOLS.find((t) => t.id === activeTool)?.label ?? activeTool}
            </span>
          </div>
          <SavedPill show={savedAnim} />
        </div>

        {/* Tab bar */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '0 var(--s4)',
            flexShrink: 0,
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: 'var(--s2) var(--s4)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-sans)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: activeTab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom:
                  activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color var(--t-fast)',
                fontWeight: activeTab === t.id ? 'var(--weight-medium)' : 'var(--weight-regular)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s5)' }}>
          {/* Tool tab */}
          {activeTab === 'tool' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s2)',
                  padding: 'var(--s2) var(--s3)',
                  background: 'var(--bg-base)',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="var(--text-tertiary)" strokeWidth="1.2" />
                  <path
                    d="M6 4v2.5l1.5 1"
                    stroke="var(--text-tertiary)"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  Tool-level overrides take precedence over global defaults
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s5)' }}>
                {schema
                  .filter((f) => f.type !== 'toggle')
                  .map((f) => (
                    <div key={f.key}>{renderField(f)}</div>
                  ))}
              </div>
              <Divider label="Behavior" />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--s4)',
                  padding: 'var(--s4)',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {schema
                  .filter((f) => f.type === 'toggle')
                  .map((f) => (
                    <div key={f.key}>{renderField(f)}</div>
                  ))}
              </div>
            </div>
          )}

          {/* Prompts tab */}
          {activeTab === 'prompts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
              {PROMPT_FIELDS.map((f) => (
                <Textarea
                  key={f.key}
                  label={f.label}
                  value={getVal(f.key) ?? GLOBAL_DEFAULTS[f.key]}
                  onChange={(e) => handleToolChange(f.key, e.target.value)}
                  rows={5}
                  onResetDefault={() => handleToolChange(f.key, GLOBAL_DEFAULTS[f.key])}
                />
              ))}
            </div>
          )}

          {/* API Keys tab */}
          {activeTab === 'keys' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
              <p
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-tertiary)',
                  lineHeight: 'var(--leading-normal)',
                }}
              >
                Keys are stored only in your browser's localStorage and never sent anywhere except
                the configured API endpoint.
              </p>
              {API_KEY_IDS.map((k) => (
                <ApiKeyField key={k.key} label={k.label} keyId={k.key} />
              ))}
            </div>
          )}

          {/* Global tab */}
          {activeTab === 'global' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s5)' }}>
                <SelectField
                  label="Default Model"
                  value={globalSettings.model}
                  onChange={(e) => handleGlobalChange('model', e.target.value)}
                  options={[
                    { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
                    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
                    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
                  ]}
                />
                <Input
                  label="Default Token Cap"
                  type="number"
                  value={globalSettings.maxTokens}
                  onChange={(e) => handleGlobalChange('maxTokens', Number(e.target.value))}
                />
                <Input
                  label="Default Budget (USD)"
                  type="number"
                  value={globalSettings.budgetUsd}
                  onChange={(e) => handleGlobalChange('budgetUsd', Number(e.target.value))}
                />
                <Slider
                  label="Default Concurrency"
                  value={globalSettings.concurrency}
                  min={1}
                  max={8}
                  step={1}
                  onChange={(v) => handleGlobalChange('concurrency', v)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: 'var(--s3) var(--s5)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            background: 'var(--bg-surface)',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-disabled)' }}>
            Changes save automatically
          </span>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SettingsPanel, GLOBAL_DEFAULTS });
