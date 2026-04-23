import { type CSSProperties, memo, useCallback, useEffect, useRef, useState } from 'react';
import type { UIEvent } from '../../shared/events.ts';
import { api, connectSSE } from '../api.ts';
import { Button, Spinner } from './primitives.tsx';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: ToolCallEntry[];
}

interface ToolCallEntry {
  key: string;
  name: string;
  args: unknown;
  result?: string;
  isError?: boolean;
  durationMs?: number;
}

type ChatStatus = 'idle' | 'running' | 'error';

interface ChatViewProps {
  activeTool: string;
  settings?: Record<string, unknown> | undefined;
  model?: string | undefined;
}

export function ChatView({ activeTool, settings, model }: ChatViewProps) {
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string>();
  const closeRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputSnapshot = useRef(input);
  inputSnapshot.current = input;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const handleEvent = useCallback(
    (ev: UIEvent) => {
      if (ev.type === 'llm' && ev.phase === 'response') {
        const assistantContent = extractAssistantText(ev);
        if (assistantContent) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: assistantContent }];
            }
            return [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: assistantContent,
                toolCalls: [],
              },
            ];
          });
        }
      } else if (ev.type === 'tool') {
        setMessages((prev) => {
          const entry: ToolCallEntry = {
            key: crypto.randomUUID(),
            name: ev.toolName,
            args: ev.args,
            ...(ev.result !== undefined ? { result: String(ev.result) } : {}),
            ...(ev.isError ? { isError: true } : {}),
            ...(ev.durationMs !== undefined ? { durationMs: ev.durationMs } : {}),
          };
          const last = prev[prev.length - 1];
          if (last?.role !== 'assistant') {
            return [
              ...prev,
              { id: crypto.randomUUID(), role: 'assistant', content: '', toolCalls: [entry] },
            ];
          }
          const existing = last.toolCalls.find(
            (tc) => tc.name === ev.toolName && tc.result === undefined && ev.result !== undefined,
          );
          const toolCalls = existing
            ? last.toolCalls.map((tc) => (tc === existing ? { ...tc, ...entry } : tc))
            : [...last.toolCalls, entry];
          return [...prev.slice(0, -1), { ...last, toolCalls }];
        });
      } else if (ev.type === 'complete') {
        setStatus('idle');
      } else if (ev.type === 'error') {
        setStatus('error');
        setErrorMsg(ev.message);
      }
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const submit = useCallback(async () => {
    const trimmed = inputSnapshot.current.trim();
    if (!trimmed || status === 'running') {
      return;
    }

    setInput('');
    setStatus('running');
    setErrorMsg(undefined);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: trimmed, toolCalls: [] },
    ]);
    scrollToBottom();

    try {
      const { id: sessionId } = await api.createSession({
        toolId: activeTool,
        question: trimmed,
        conversationId,
        settings: {
          ...(settings ?? {}),
          ...(model ? { model } : {}),
        },
      });

      closeRef.current?.();
      closeRef.current = connectSSE(
        sessionId,
        handleEvent,
        () => setStatus((s) => (s === 'running' ? 'idle' : s)),
        () => setStatus('error'),
      );
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start session');
    }
  }, [status, activeTool, conversationId, settings, model, handleEvent, scrollToBottom]);

  const handleNewChat = useCallback(() => {
    closeRef.current?.();
    closeRef.current = null;
    setConversationId(crypto.randomUUID());
    setMessages([]);
    setStatus('idle');
    setErrorMsg(undefined);
    setInput('');
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void submit();
      }
    },
    [submit],
  );

  useEffect(() => {
    return () => {
      closeRef.current?.();
    };
  }, []);

  return (
    <div style={containerStyle}>
      <div ref={scrollRef} style={messageListStyle}>
        {messages.length === 0 && status === 'idle' && <EmptyState />}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {status === 'running' && (
          <div
            style={{
              padding: 'var(--s2) var(--s5)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s2)',
            }}
          >
            <Spinner size={12} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Thinking...
            </span>
          </div>
        )}
        {errorMsg && <div style={errorBannerStyle}>{errorMsg}</div>}
      </div>

      <div style={inputBarStyle}>
        <Button variant="ghost" size="sm" onClick={handleNewChat} style={{ flexShrink: 0 }}>
          New chat
        </Button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          rows={1}
          style={textareaStyle}
        />
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={!input.trim() || status === 'running'}
          loading={status === 'running'}
        >
          Send
        </Button>
      </div>
    </div>
  );
}

function extractAssistantText(ev: UIEvent & { type: 'llm' }): string | undefined {
  const msgs = ev.messages;
  if (!Array.isArray(msgs)) {
    return undefined;
  }
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m?.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) {
      return m.content;
    }
  }
  return undefined;
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--s3)',
          padding: 'var(--s8) var(--s10)',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <p style={{ fontSize: 'var(--text-md)', color: 'var(--text-tertiary)' }}>Simple Chat</p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-disabled)' }}>
          Ask me anything. I can do math and tell the time.
        </p>
      </div>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        padding: 'var(--s2) var(--s5)',
        gap: 'var(--s2)',
      }}
    >
      <div style={isUser ? userBubbleStyle : assistantBubbleStyle}>
        {message.content && (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.content}</div>
        )}
      </div>
      {message.toolCalls.length > 0 && (
        <div style={toolCallListStyle}>
          {message.toolCalls.map((tc) => (
            <ToolCallRow key={tc.key} call={tc} />
          ))}
        </div>
      )}
    </div>
  );
});

function ToolCallRow({ call }: { call: ToolCallEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={toolCallStyle}>
      <button type="button" onClick={() => setOpen((p) => !p)} style={toolCallHeaderStyle}>
        <span style={{ color: 'var(--accent)', fontWeight: 'var(--weight-medium)' }}>
          {call.name}
        </span>
        {call.durationMs !== undefined && (
          <span style={{ color: 'var(--text-disabled)', fontSize: 'var(--text-2xs)' }}>
            {call.durationMs}ms
          </span>
        )}
        {call.isError && (
          <span style={{ color: 'var(--status-error)', fontSize: 'var(--text-2xs)' }}>error</span>
        )}
        <span style={{ color: 'var(--text-disabled)', fontSize: 'var(--text-2xs)' }}>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div style={toolCallBodyStyle}>
          <div>
            <span style={toolCallLabelStyle}>args</span>
            <pre style={preStyle}>{JSON.stringify(call.args, null, 2)}</pre>
          </div>
          {call.result !== undefined && (
            <div>
              <span style={toolCallLabelStyle}>result</span>
              <pre style={preStyle}>{call.result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const containerStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  minHeight: 0,
};

const messageListStyle: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--s1)',
  paddingTop: 'var(--s4)',
  paddingBottom: 'var(--s4)',
};

const inputBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--s3)',
  padding: 'var(--s3) var(--s5)',
  borderTop: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface)',
  flexShrink: 0,
};

const textareaStyle: CSSProperties = {
  flex: 1,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--r-sm)',
  padding: '6px 10px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-sm)',
  outline: 'none',
  resize: 'none',
  lineHeight: 'var(--leading-normal)',
};

const userBubbleStyle: CSSProperties = {
  maxWidth: '75%',
  padding: 'var(--s2) var(--s3)',
  borderRadius: 'var(--r-md)',
  background: 'var(--accent)',
  color: '#fff',
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--leading-normal)',
};

const assistantBubbleStyle: CSSProperties = {
  maxWidth: '75%',
  padding: 'var(--s2) var(--s3)',
  borderRadius: 'var(--r-md)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--leading-normal)',
};

const toolCallListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--s1)',
  maxWidth: '75%',
};

const toolCallStyle: CSSProperties = {
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border-subtle)',
  overflow: 'hidden',
  fontSize: 'var(--text-xs)',
};

const toolCallHeaderStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--s2)',
  padding: 'var(--s1) var(--s2)',
  background: 'var(--bg-surface)',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
};

const toolCallBodyStyle: CSSProperties = {
  padding: 'var(--s2)',
  background: 'var(--bg-base)',
  borderTop: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--s2)',
};

const toolCallLabelStyle: CSSProperties = {
  fontSize: 'var(--text-2xs)',
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-wide)',
  fontWeight: 'var(--weight-medium)',
};

const preStyle: CSSProperties = {
  margin: '2px 0 0',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const errorBannerStyle: CSSProperties = {
  margin: 'var(--s2) var(--s5)',
  padding: 'var(--s2) var(--s3)',
  borderRadius: 'var(--r-sm)',
  background: 'var(--status-error-subtle)',
  border: '1px solid oklch(64% 0.18 25 / 0.3)',
  color: 'var(--status-error)',
  fontSize: 'var(--text-xs)',
};
