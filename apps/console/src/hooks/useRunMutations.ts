import type { SettingsResponse } from '@harness/http/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { api } from '../api/client.ts';

export interface RunFormState {
  query: string;
  model: string;
}

export interface RunMutationsDeps {
  activeTool: string;
  form: RunFormState;
  settings: SettingsResponse | undefined;
  runId: string | null;
  conversationId?: string | null;
  setRunId: (id: string | null) => void;
  setForm: Dispatch<SetStateAction<RunFormState>>;
  setView: (v: 'session') => void;
  pushToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function useRunMutations(deps: RunMutationsDeps) {
  const {
    activeTool,
    form,
    settings,
    runId,
    conversationId,
    setRunId,
    setForm,
    setView,
    pushToast,
  } = deps;
  const queryClient = useQueryClient();

  const createRunMutation = useMutation({
    mutationFn: (vars: { question: string; label: string }) => {
      const capabilityOverrides =
        activeTool === 'deep-research'
          ? (settings?.capabilities['deep-research']?.values as Record<string, unknown> | undefined)
          : undefined;
      const input =
        activeTool === 'deep-research' ? { question: vars.question } : { message: vars.question };
      return api.createRun({
        capabilityId: activeTool,
        input,
        settings: {
          ...(capabilityOverrides ?? {}),
          ...(form.model ? { model: form.model } : {}),
        },
        ...(conversationId ? { conversationId } : {}),
      });
    },
    onSuccess: (data, vars) => {
      setRunId(data.runId);
      setView('session');
      pushToast(vars.label, 'info');
    },
    onError: (err: Error, vars) => {
      pushToast(err.message || `Failed to ${vars.label.toLowerCase()}`, 'error');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  const cancelRunMutation = useMutation({
    mutationFn: (id: string) => api.cancelRun(id),
    onSuccess: () => {
      pushToast('Stop request sent', 'info');
    },
    onError: (err: Error) => {
      pushToast(err.message || 'Could not cancel run', 'error');
    },
  });

  const deleteRunMutation = useMutation({
    mutationFn: (id: string) => api.deleteRun(id),
    onSuccess: (_data, id) => {
      if (runId === id) {
        setRunId(null);
        setForm((prev) => {
          return { query: '', model: prev.model };
        });
      }
      pushToast('Run deleted', 'info');
    },
    onError: (err: Error) => {
      pushToast(err.message || 'Failed to delete run', 'error');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  const handleRun = useCallback(() => {
    if (!form.query.trim() || createRunMutation.isPending) {
      return;
    }
    createRunMutation.mutate({ question: form.query, label: 'Run started' });
  }, [form.query, createRunMutation]);

  const handleRetry = useCallback(() => {
    if (!form.query.trim() || createRunMutation.isPending) {
      return;
    }
    createRunMutation.mutate({ question: form.query, label: 'Retrying run' });
  }, [form.query, createRunMutation]);

  const handleStop = useCallback(() => {
    if (runId) {
      cancelRunMutation.mutate(runId);
    }
  }, [runId, cancelRunMutation]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteRunMutation.mutate(id);
    },
    [deleteRunMutation],
  );

  return {
    handleRun,
    handleRetry,
    handleStop,
    handleDelete,
    isSubmitting: createRunMutation.isPending,
  };
}
