import { useCallback, useState } from 'react';

export type ToastType = 'error' | 'success' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => {
      return [...prev, { id, type, message }];
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => {
      return prev.filter((t) => {
        return t.id !== id;
      });
    });
  }, []);

  return { toasts, pushToast, removeToast };
}
