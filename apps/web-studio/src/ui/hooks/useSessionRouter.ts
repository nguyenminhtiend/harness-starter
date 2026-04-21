import { useCallback, useEffect, useState } from 'react';

function getSessionIdFromHash(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/^#\/sessions\/(.+)$/);
  return match?.[1] ?? null;
}

function setHashSessionId(id: string | null) {
  if (id) {
    window.history.pushState(null, '', `#/sessions/${id}`);
  } else {
    window.history.pushState(null, '', window.location.pathname);
  }
}

export function useSessionRouter() {
  const [sessionId, setSessionIdState] = useState<string | null>(getSessionIdFromHash);

  const setSessionId = useCallback((id: string | null) => {
    setSessionIdState(id);
    setHashSessionId(id);
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setSessionIdState(getSessionIdFromHash());
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  return { sessionId, setSessionId };
}
