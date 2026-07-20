import React from 'react';

// Poll an async function on an interval while the screen is mounted. Returns
// the latest value, an error flag, and a manual refresh. Skips overlapping
// runs so a slow dongle response can't stack requests.
export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs: number,
): { data: T | null; error: boolean; refresh: () => void } {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState(false);
  const busy = React.useRef(false);
  const fnRef = React.useRef(fn);
  fnRef.current = fn;

  const run = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const v = await fnRef.current();
      setData(v);
      setError(false);
    } catch {
      setError(true);
    } finally {
      busy.current = false;
    }
  }, []);

  React.useEffect(() => {
    run();
    const t = setInterval(run, intervalMs);
    return () => clearInterval(t);
  }, [run, intervalMs]);

  return { data, error, refresh: run };
}
