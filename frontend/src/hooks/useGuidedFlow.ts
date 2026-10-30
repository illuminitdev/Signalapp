"use client";

import { useCallback, useEffect } from "react";
import { usePersistentState } from "./usePersistentState";

/**
 * Step state for a guided flow. The step survives a refresh, but never runs ahead of
 * `reachable` (the furthest step whose earlier steps are complete), so a refresh can't land
 * on a step whose data is missing.
 */
export function useGuidedFlow(key: string, total: number, reachable: number) {
  const [saved, setSaved] = usePersistentState<number>(`guide:${key}:step`, 0);
  const current = Math.max(0, Math.min(saved, reachable, total - 1));

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [current]);

  const goTo = useCallback(
    (i: number) => setSaved(Math.max(0, Math.min(i, total - 1))),
    [setSaved, total],
  );
  const next = useCallback(() => goTo(current + 1), [goTo, current]);
  const back = useCallback(() => goTo(current - 1), [goTo, current]);
  const restart = useCallback(() => goTo(0), [goTo]);

  return { current, goTo, next, back, restart };
}
