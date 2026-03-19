import { useEffect, useRef, useCallback } from 'react';

interface AutoRefreshOptions {
  intervalMs?: number;
  refetchOnFocus?: boolean;
  enabled?: boolean;
}

export default function useAutoRefresh(
  callback: () => void,
  options?: AutoRefreshOptions,
) {
  const {
    intervalMs = 60_000,
    refetchOnFocus = true,
    enabled = true,
  } = options ?? {};

  const inFlight = useRef(false);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const safeCall = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      callbackRef.current();
    } finally {
      // Allow next call after a short delay to avoid rapid-fire
      setTimeout(() => { inFlight.current = false; }, 1000);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // --- Refetch on tab focus ---
    const onVisibility = () => {
      if (refetchOnFocus && document.visibilityState === 'visible') {
        safeCall();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // --- Polling (only while visible) ---
    let timer: ReturnType<typeof setInterval> | null = null;
    if (intervalMs > 0) {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          safeCall();
        }
      }, intervalMs);
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer) clearInterval(timer);
    };
  }, [enabled, intervalMs, refetchOnFocus, safeCall]);
}
