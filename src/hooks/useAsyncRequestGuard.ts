import { useCallback, useEffect, useRef } from 'react';
export function useAsyncRequestGuard() {
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const startRequest = useCallback(() => ++requestIdRef.current, []);

  const isStale = useCallback(
    (requestId: number) =>
      !mountedRef.current || requestId !== requestIdRef.current,
    [],
  );

  return { startRequest, isStale };
}
