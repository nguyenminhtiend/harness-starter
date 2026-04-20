import { useQuery } from '@tanstack/react-query';
import type { SettingsResponse } from '../../shared/settings.ts';
import { api } from '../api.ts';

export function useSettings() {
  return useQuery<SettingsResponse>({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });
}
