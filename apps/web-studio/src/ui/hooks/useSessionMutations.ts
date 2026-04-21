import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { SettingsResponse } from '../../shared/settings.ts';
import { api } from '../api.ts';
import type { SessionFormState } from '../components/SessionForm.tsx';

export interface SessionMutationsDeps {
  activeTool: string;
  form: SessionFormState;
  settings: SettingsResponse | undefined;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  setForm: React.Dispatch<React.SetStateAction<SessionFormState>>;
  setView: (v: 'session') => void;
  pushToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function useSessionMutations(deps: SessionMutationsDeps) {
  const { activeTool, form, settings, sessionId, setSessionId, setForm, setView, pushToast } = deps;
  const queryClient = useQueryClient();

  const createSession = useMutation({
    mutationFn: (vars: { question: string; label: string }) => {
      const toolOverrides =
        activeTool === 'deep-research'
          ? (settings?.tools['deep-research']?.values as Record<string, unknown> | undefined)
          : undefined;
      return api.createSession({
        toolId: activeTool,
        question: vars.question,
        settings: {
          ...(toolOverrides ?? {}),
          ...(form.model ? { model: form.model } : {}),
        },
      });
    },
    onSuccess: (data, vars) => {
      setSessionId(data.id);
      setView('session');
      pushToast(vars.label, 'info');
    },
    onError: (err: Error, vars) => {
      pushToast(err.message || `Failed to ${vars.label.toLowerCase()}`, 'error');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const cancelSession = useMutation({
    mutationFn: (id: string) => api.cancelSession(id),
    onSuccess: () => pushToast('Stop request sent', 'info'),
    onError: (err: Error) => pushToast(err.message || 'Could not cancel session', 'error'),
  });

  const deleteSession = useMutation({
    mutationFn: (id: string) => api.deleteSession(id),
    onSuccess: (_data, id) => {
      if (sessionId === id) {
        setSessionId(null);
        setForm((prev) => ({ query: '', model: prev.model }));
      }
      pushToast('Session deleted', 'info');
    },
    onError: (err: Error) => pushToast(err.message || 'Failed to delete session', 'error'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const handleRun = useCallback(() => {
    if (!form.query.trim() || createSession.isPending) {
      return;
    }
    createSession.mutate({ question: form.query, label: 'Session started' });
  }, [form.query, createSession]);

  const handleRetry = useCallback(() => {
    if (!form.query.trim() || createSession.isPending) {
      return;
    }
    createSession.mutate({ question: form.query, label: 'Retrying session' });
  }, [form.query, createSession]);

  const handleStop = useCallback(() => {
    if (sessionId) {
      cancelSession.mutate(sessionId);
    }
  }, [sessionId, cancelSession]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteSession.mutate(id);
    },
    [deleteSession],
  );

  return {
    handleRun,
    handleRetry,
    handleStop,
    handleDelete,
    isSubmitting: createSession.isPending,
  };
}
