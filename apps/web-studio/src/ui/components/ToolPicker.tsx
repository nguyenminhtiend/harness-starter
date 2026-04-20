interface ToolPickerProps {
  activeTool: string;
  onSelect: (id: string) => void;
}

const TOOLS = [
  { id: 'deep-research', label: 'Deep Research', disabled: false },
  { id: 'summarizer', label: 'Summarizer', disabled: true },
  { id: 'web-search', label: 'Web Search', disabled: true },
];

export function ToolPicker({ activeTool, onSelect }: ToolPickerProps) {
  return (
    <div style={{ padding: 'var(--s3) var(--s2)' }}>
      <div
        style={{
          fontSize: 'var(--text-2xs)',
          fontWeight: 'var(--weight-medium)',
          color: 'var(--text-tertiary)',
          letterSpacing: 'var(--tracking-wide)',
          textTransform: 'uppercase',
          padding: '0 var(--s2) var(--s2)',
        }}
      >
        Tools
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {TOOLS.map((tool) => (
          <button
            type="button"
            key={tool.id}
            onClick={() => {
              if (!tool.disabled) {
                onSelect(tool.id);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s3)',
              padding: '6px var(--s3)',
              borderRadius: 'var(--r-sm)',
              background: activeTool === tool.id ? 'var(--bg-overlay)' : 'transparent',
              border: `1px solid ${activeTool === tool.id ? 'var(--border-subtle)' : 'transparent'}`,
              color: tool.disabled
                ? 'var(--text-disabled)'
                : activeTool === tool.id
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
              cursor: tool.disabled ? 'not-allowed' : 'pointer',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-sans)',
              transition: 'all var(--t-fast)',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span style={{ flex: 1 }}>{tool.label}</span>
            {tool.disabled && (
              <span
                style={{
                  fontSize: 'var(--text-2xs)',
                  color: 'var(--text-disabled)',
                  background: 'var(--bg-overlay)',
                  padding: '1px 5px',
                  borderRadius: 'var(--r-full)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                soon
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
