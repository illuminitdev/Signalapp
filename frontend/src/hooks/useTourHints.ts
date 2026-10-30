"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useWorkspace } from "./useWorkspace";

/**
 * Which tour hints a user has closed. Kept in the browser (a view convenience, like other
 * UI preferences) and shared live between every hint on the page, so "Show tips again"
 * brings them all back at once.
 */
const EVENT = "signal:tour-hints";

function storageKey(userId: string) {
  return `signal:${userId}:hints:dismissed`;
}

function read(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
}

// useSyncExternalStore needs a stable snapshot; cache the parsed list per raw value
let lastRaw: string | null = null;
let lastList: string[] = [];
function snapshot(key: string) {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    raw = null;
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastList = raw ? read(key) : [];
  }
  return lastList;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const EMPTY: string[] = [];

export function useTourHints() {
  const { user } = useWorkspace();
  const key = storageKey(user?.id ?? "anon");
  const dismissed = useSyncExternalStore(subscribe, () => snapshot(key), () => EMPTY);

  const write = useCallback(
    (list: string[]) => {
      try {
        localStorage.setItem(key, JSON.stringify(list));
      } catch {
        // storage unavailable: hints simply show again next visit
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return {
    isDismissed: (id: string) => dismissed.includes(id),
    dismiss: (id: string) => write([...new Set([...read(key), id])]),
    resetAll: () => write([]),
    anyDismissed: dismissed.length > 0,
  };
}
