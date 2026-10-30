"use client";

import { useCallback, useEffect, useState } from "react";
import { useOptionalUserId } from "./useWorkspace";

const PREFIX = "signal:";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * useState that survives a page refresh (per browser). For view conveniences only —
 * filters, half-typed text, the selected tab — never for data that must be shared or
 * kept reliably, which lives in the database. Storage may be unavailable (private
 * mode, blocked site data); the page then simply starts from `initial`.
 *
 * Saved per signed-in user, so two people using the same browser (e.g. an admin and a
 * researcher) never pick up each other's selections or guided-flow steps.
 */
export function usePersistentState<T>(baseKey: string, initial: T) {
  const userId = useOptionalUserId();
  const key = `${userId ?? "anon"}:${baseKey}`;
  const [value, setValue] = useState<T>(initial);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // Load after mount (localStorage is not available during server rendering)
  useEffect(() => {
    setValue(read(key, initial));
    setLoadedKey(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the key changes
  }, [key]);

  useEffect(() => {
    if (loadedKey !== key) return;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // storage unavailable — the value still works for this visit
    }
  }, [key, value, loadedKey]);

  const reset = useCallback(() => setValue(initial), [initial]);
  return [value, setValue, reset] as const;
}
