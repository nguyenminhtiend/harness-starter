import { useCallback, useEffect, useState } from 'react';

function getRunIdFromHash(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/^#\/runs\/(.+)$/);
  return match?.[1] ?? null;
}

function setHashRunId(id: string | null) {
  if (id) {
    window.history.pushState(null, '', `#/runs/${id}`);
  } else {
    window.history.pushState(null, '', window.location.pathname);
  }
}

export function useRunRouter(): { runId: string | null; setRunId: (id: string | null) => void } {
  const [runId, setRunIdState] = useState<string | null>(getRunIdFromHash);

  const setRunId = useCallback((id: string | null) => {
    setRunIdState(id);
    setHashRunId(id);
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setRunIdState(getRunIdFromHash());
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  return { runId, setRunId };
}
