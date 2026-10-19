import { useCallback, useEffect, useState } from 'react';

interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

interface Settled<T> {
  depsKey: string;
  nonce: number;
  data?: T;
  error?: Error;
}

/**
 * Runs an async loader on mount (and when deps change) and tracks its state.
 * Data for the same deps stays visible while a reload is in flight.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [nonce, setNonce] = useState(0);
  const depsKey = JSON.stringify(deps);
  const [settled, setSettled] = useState<Settled<T>>({ depsKey: '', nonce: -1 });

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setSettled({ depsKey, nonce, data });
      },
      (error: Error) => {
        if (!cancelled) setSettled({ depsKey, nonce, error });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const sameDeps = settled.depsKey === depsKey;
  const current = sameDeps && settled.nonce === nonce;
  return {
    data: sameDeps ? settled.data : undefined,
    error: current ? settled.error : undefined,
    loading: !current,
    reload,
  };
}
