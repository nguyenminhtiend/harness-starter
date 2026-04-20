import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';

const AUTO_DISMISS_MS = 4000;
const EXIT_ANIM_MS = 280;

export type ToastType = 'error' | 'success' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastProps {
  toasts: ToastItem[];
  removeToast: (id: string) => void;
}

const toastIcons: Record<ToastType, string> = {
  error: '⚠',
  success: '✓',
  info: 'ℹ',
};

const borderForType = (type: ToastType): string => {
  if (type === 'error') {
    return 'var(--status-error-subtle)';
  }
  if (type === 'success') {
    return 'oklch(70% 0.15 148 / 0.3)';
  }
  return 'var(--border-default)';
};

interface ToastRowProps {
  item: ToastItem;
  removeToast: (id: string) => void;
}

function ToastRow({ item, removeToast }: ToastRowProps) {
  const [exiting, setExiting] = useState(false);

  const beginExit = useCallback(() => {
    setExiting((prev) => {
      if (prev) {
        return prev;
      }
      return true;
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      beginExit();
    }, AUTO_DISMISS_MS);
    return () => {
      clearTimeout(t);
    };
  }, [beginExit]);

  useEffect(() => {
    if (!exiting) {
      return;
    }
    const t = setTimeout(() => {
      removeToast(item.id);
    }, EXIT_ANIM_MS);
    return () => {
      clearTimeout(t);
    };
  }, [exiting, item.id, removeToast]);

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--s3)',
    background: 'var(--bg-overlay)',
    border: `1px solid ${borderForType(item.type)}`,
    borderRadius: 'var(--r-md)',
    padding: 'var(--s3) var(--s4)',
    boxShadow: 'var(--shadow-lg)',
    minWidth: 260,
    maxWidth: 380,
    pointerEvents: 'all',
    animation: exiting
      ? `toastFadeOut ${EXIT_ANIM_MS}ms ease forwards`
      : `toastSlideIn 220ms cubic-bezier(0.16, 1, 0.3, 1)`,
  };

  return (
    <div style={rowStyle}>
      <span style={{ fontSize: 14, flexShrink: 0 }} aria-hidden="true">
        {toastIcons[item.type]}
      </span>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', flex: 1 }}>
        {item.message}
      </span>
      <button
        type="button"
        onClick={() => {
          beginExit();
        }}
        aria-label="Dismiss notification"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-tertiary)',
          padding: 2,
          lineHeight: 1,
          fontSize: 14,
        }}
      >
        ×
      </button>
    </div>
  );
}

export function Toast({ toasts, removeToast }: ToastProps) {
  return (
    <section
      aria-label="Notifications"
      style={{
        position: 'fixed',
        bottom: 'var(--s6)',
        right: 'var(--s6)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s2)',
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} item={t} removeToast={removeToast} />
      ))}
    </section>
  );
}
