"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ApiQueryState<T> {
  /** Data for the current key (a previous key's data is never returned). */
  data: T | undefined;
  /** Error of the last settled request for the current key (hidden while a retry is in flight). */
  error: unknown;
  /** True while a request for the current key is in flight (including background reloads). */
  isLoading: boolean;
  reload: () => void;
}

/** Result of the last settled request: which key/attempt it answered, and its outcome. */
interface Settled<T> {
  key: string | null;
  attempt: number;
  data?: T;
  error?: unknown;
}

/**
 * Loads data on the client after mount (the API is a separate process, so nothing is fetched during
 * SSR or `next build`). `key` identifies the request: changing it refetches; `null` skips fetching.
 * Responses for a previous key are discarded and in-flight requests are aborted on change/unmount.
 * `reload()` refetches the current key while keeping its current data visible.
 *
 * State is only written when a request settles; "loading" is derived by comparing the settled
 * key/attempt with the current ones, so the effect never sets state synchronously.
 */
export function useApiQuery<T>(key: string | null, fetcher: (signal: AbortSignal) => Promise<T>): ApiQueryState<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ key: null, attempt: -1 });
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const settle = (outcome: { data?: T; error?: unknown }) =>
      setSettled((prev) => ({
        key,
        attempt,
        // Keep the previous data for this key when a reload fails.
        data: "data" in outcome ? outcome.data : prev.key === key ? prev.data : undefined,
        error: outcome.error,
      }));

    fetcherRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) settle({ data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) settle({ error });
      },
    );
    return () => controller.abort();
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const sameKey = key !== null && settled.key === key;
  const isLoading = key !== null && (!sameKey || settled.attempt !== attempt);
  return {
    data: sameKey ? settled.data : undefined,
    error: sameKey && !isLoading ? settled.error : undefined,
    isLoading,
    reload,
  };
}
