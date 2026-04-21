import { useEffect } from 'react';
import type { SessionStatus } from '../../shared/events.ts';

interface HotkeysDeps {
  status: SessionStatus | 'idle';
  query: string;
  onRun: () => void;
  onEscapeHitl: () => void;
  hitlOpen: boolean;
  view: string;
  setView: (v: 'session') => void;
}

export function useHotkeys(deps: HotkeysDeps) {
  const { status, query, onRun, onEscapeHitl, hitlOpen, view, setView } = deps;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && status === 'idle' && query.trim()) {
        onRun();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [status, query, onRun]);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return;
      }
      if (hitlOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void onEscapeHitl();
        return;
      }
      if (view === 'settings') {
        e.preventDefault();
        setView('session');
      }
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [onEscapeHitl, hitlOpen, view, setView]);
}
