// Shared loader for screen data. Replaces the `fetch().then(setState).catch(() => {})` pattern,
// which had two problems the security/code audit flagged:
//
//  1. SILENT FAILURE. A rejected fetch left state at its initial value, so screens rendered
//     their fallback constants as if they were real measurements — e.g. Recovery's HRV gauge
//     sat at the neutral 0.5 position, visually indistinguishable from a genuine reading. In a
//     health app that is worse than showing an error.
//  2. RACE CONDITION. Nothing cancelled an in-flight request, so when a dependency changed
//     (the 7/14-day toggle) a slow earlier response could land after a fast later one and
//     leave the wrong range on screen.
//
// `failed` lets a screen say so, `reload` retries, and the cancellation flag makes the last
// requested load the one that wins — regardless of the order responses arrive in.
import { useCallback, useEffect, useState } from "react";

export type AsyncData<T> = {
  /** null until the first successful load (and after a failure with no prior data). */
  data: T | null;
  loading: boolean;
  /** True when the most recent attempt rejected. Render an error state, never fallback data. */
  failed: boolean;
  reload: () => void;
};

export function useAsyncData<T>(fetcher: () => Promise<T>, deps: readonly unknown[]): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Bumping this re-runs the effect without the caller having to touch its own deps.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetcher()
      .then((result) => {
        if (cancelled) return; // a newer load superseded this one
        setData(result);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `fetcher` is a fresh closure every render, so it deliberately isn't a dependency —
    // the caller's `deps` describe when a reload is actually warranted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, loading, failed, reload };
}
