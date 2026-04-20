import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SettingsResponse, SettingsUpdateRequest } from '../../shared/settings.ts';
import { api } from '../api.ts';

const QUERY_KEY = ['studio-settings'] as const;
const DEBOUNCE_MS = 450;

export function useSettings() {
  const queryClient = useQueryClient();
  const [saveFlash, setSaveFlash] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(new Map<string, Record<string, unknown>>());

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.getSettings(),
  });

  const mutation = useMutation({
    mutationFn: (body: SettingsUpdateRequest) => api.updateSettings(body),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<SettingsResponse>(QUERY_KEY);
      if (!prev) {
        return { prev };
      }
      if (vars.scope === 'global') {
        queryClient.setQueryData<SettingsResponse>(QUERY_KEY, {
          ...prev,
          global: { ...prev.global, ...vars.settings },
        });
      } else {
        const tool = prev.tools[vars.scope];
        if (tool) {
          const inheritedFromGlobal = { ...tool.inheritedFromGlobal };
          for (const k of Object.keys(vars.settings)) {
            if (k in inheritedFromGlobal) {
              inheritedFromGlobal[k] = false;
            }
          }
          const nextValues = { ...tool.values, ...vars.settings };
          for (const [k, v] of Object.entries(vars.settings)) {
            if (k.endsWith('ApiKey') && typeof v === 'string') {
              nextValues[k] = { set: v.length > 0 };
            }
          }
          queryClient.setQueryData<SettingsResponse>(QUERY_KEY, {
            ...prev,
            tools: {
              ...prev.tools,
              [vars.scope]: {
                values: nextValues,
                inheritedFromGlobal,
              },
            },
          });
        }
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(QUERY_KEY, ctx.prev);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const flushPending = useCallback(async () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    const entries = [...pending.current.entries()];
    for (const [scope] of entries) {
      pending.current.delete(scope);
    }
    if (entries.length === 0) {
      return;
    }
    for (const [scope, settings] of entries) {
      await mutation.mutateAsync({ scope, settings });
    }
    setSaveFlash(true);
    window.setTimeout(() => {
      setSaveFlash(false);
    }, 1600);
  }, [mutation]);

  const schedulePatch = useCallback(
    (scope: string, patch: Record<string, unknown>) => {
      const prev = pending.current.get(scope) ?? {};
      pending.current.set(scope, { ...prev, ...patch });
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null;
        void flushPending();
      }, DEBOUNCE_MS);
    },
    [flushPending],
  );

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, []);

  return {
    ...query,
    schedulePatch,
    saveFlash,
    isSaving: mutation.isPending,
    flushPending,
  };
}
