"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  CircleCheck,
  ClipboardList,
  Clock,
  FileCheck2,
  Handshake,
  Inbox,
  Radar,
  RotateCcw,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { usePortal } from "../../hooks/usePortal";
import { useWorkspace } from "../../hooks/useWorkspace";
import { listNotifications, type NotificationItem } from "../../lib/api/notifications";

/**
 * One bell entry. `times` (when each underlying thing happened) lets the bell count only what
 * is new since the person last looked; without it, the whole count is new until marked read.
 */
export type BellItem = {
  key: string;
  Icon: LucideIcon;
  label: string;
  detail?: string | null;
  count: number;
  href: string;
  times?: string[];
};

type StoredBellState = {
  /** Count-based items: the count when last read / cleared */
  readCounts: Record<string, number>;
  clearedCounts: Record<string, number>;
  /** Time-based items: when last read / cleared (ISO) */
  seenAt?: Record<string, string>;
  clearedAt?: Record<string, string>;
};

const EMPTY_STATE: StoredBellState = { readCounts: {}, clearedCounts: {}, seenAt: {}, clearedAt: {} };

function readBellStorage(key: string): StoredBellState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = localStorage.getItem(`signal:bell:${key}`);
    return raw ? { ...EMPTY_STATE, ...JSON.parse(raw) } : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

function writeBellStorage(key: string, data: StoredBellState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`signal:bell:${key}`, JSON.stringify(data));
  } catch {}
}

const ICONS: Record<NotificationItem["kind"], LucideIcon> = {
  tasks: ClipboardList,
  review: FileCheck2,
  returned: RotateCcw,
  decided: CircleCheck,
  shared: Inbox,
  handoff_reply: Handshake,
  changes: Radar,
  accepted: TrendingUp,
};

/**
 * Header bell for every portal: work and news for the signed-in person, built on the server
 * from live records and their role. In-app only; nothing is emailed. Links open pages in
 * their own portal. Refreshes every minute and whenever the bell is opened.
 */
export function AttentionBell() {
  const { workspaceId, user } = useWorkspace();
  const { href: portalHref } = usePortal();
  const [items, setItems] = useState<BellItem[]>([]);

  const load = useCallback(async () => {
    if (!workspaceId || !user) return;
    try {
      const { items: rows } = await listNotifications(workspaceId);
      setItems(
        rows.map((n) => ({
          key: n.key,
          Icon: n.key === "tasks_overdue" ? Clock : ICONS[n.kind],
          label: n.label,
          detail: n.detail,
          count: n.count,
          href: portalHref(n.href),
          times: n.times,
        })),
      );
    } catch {
      // Keep what was shown; the next refresh tries again
    }
  }, [workspaceId, user, portalHref]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <BellMenu
      storageKey={`ws:${workspaceId ?? "default"}:${user?.id ?? "me"}`}
      items={items}
      onOpen={() => void load()}
    />
  );
}

/** Bell button with a count badge and a dropdown of linked items. */
export function BellMenu({
  items,
  onOpen,
  storageKey = "default",
}: {
  items: BellItem[];
  onOpen?: () => void;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<StoredBellState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setState(readBellStorage(storageKey));
    setLoaded(true);
  }, [storageKey]);

  const updateState = (updater: (prev: StoredBellState) => StoredBellState) => {
    setState((prev) => {
      const next = updater(prev);
      writeBellStorage(storageKey, next);
      return next;
    });
  };

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const newerThan = (times: string[], since: string | undefined) => (since ? times.filter((t) => t > since).length : times.length);

  /** How many of this item's things are new (unread) */
  const newCount = (i: BellItem) => {
    if (i.times) return newerThan(i.times, state.seenAt?.[i.key]);
    const read = state.readCounts[i.key];
    return read !== undefined && i.count <= read ? 0 : i.count;
  };

  /** Dismissed, and nothing has happened since */
  const isCleared = (i: BellItem) => {
    if (i.times) {
      const at = state.clearedAt?.[i.key];
      return at !== undefined && newerThan(i.times, at) === 0;
    }
    const cleared = state.clearedCounts[i.key];
    return cleared !== undefined && i.count <= cleared;
  };

  const pending = items.filter((i) => i.count > 0 && !isCleared(i));
  const unreadPending = pending.filter((i) => newCount(i) > 0);
  const total = loaded ? unreadPending.reduce((n, i) => n + newCount(i), 0) : 0;

  const markRead = (list: BellItem[]) => {
    const now = new Date().toISOString();
    updateState((prev) => {
      const readCounts = { ...prev.readCounts };
      const seenAt = { ...(prev.seenAt ?? {}) };
      for (const i of list) {
        if (i.times) seenAt[i.key] = i.times[0] && i.times[0] > now ? i.times[0] : now;
        else readCounts[i.key] = i.count;
      }
      return { ...prev, readCounts, seenAt };
    });
  };

  const clear = (list: BellItem[]) => {
    const now = new Date().toISOString();
    updateState((prev) => {
      const clearedCounts = { ...prev.clearedCounts };
      const clearedAt = { ...(prev.clearedAt ?? {}) };
      const seenAt = { ...(prev.seenAt ?? {}) };
      for (const i of list) {
        if (i.times) {
          clearedAt[i.key] = i.times[0] && i.times[0] > now ? i.times[0] : now;
          seenAt[i.key] = clearedAt[i.key]!;
        } else clearedCounts[i.key] = i.count;
      }
      return { ...prev, clearedCounts, clearedAt, seenAt };
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={total ? `${total} new notifications` : "No new notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          open
            ? "border-[var(--line)] bg-[var(--chip-bg)] text-[var(--foreground)]"
            : "border-transparent text-[#5b6875] hover:border-[var(--line)] hover:bg-[var(--chip-bg)] hover:text-[var(--foreground)]"
        }`}
      >
        <Bell size={18} strokeWidth={1.75} aria-hidden />
        {total > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--red)] px-1 text-[10.5px] font-semibold leading-none text-white ring-2 ring-white">
            {total > 99 ? "99+" : total}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-40 w-[22rem] overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_12px_32px_rgba(23,44,64,0.12)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <p className="text-[13.5px] font-semibold text-[var(--foreground)]">Notifications</p>
            {pending.length > 0 ? <span className="text-xs text-[var(--muted)]">{total} new</span> : null}
          </div>

          {pending.length > 0 ? (
            <div className="flex items-center gap-1 border-b border-[var(--line)] px-3 py-2">
              <button
                type="button"
                onClick={() => markRead(pending)}
                disabled={unreadPending.length === 0}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--chip-bg)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--muted)]"
              >
                <CheckCheck size={13} strokeWidth={2} aria-hidden />
                Mark all read
              </button>
              <button
                type="button"
                onClick={() => clear(pending)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--red-tint)] hover:text-[var(--red-active)]"
              >
                <Trash2 size={13} strokeWidth={2} aria-hidden />
                Clear all
              </button>
            </div>
          ) : null}

          {pending.length > 0 ? (
            <ul className="max-h-96 overflow-y-auto py-1">
              {pending.map((item) => {
                const { key, Icon, label, detail, count, href } = item;
                const fresh = newCount(item);
                return (
                  <li key={key} className="group/item relative">
                    <Link
                      href={href}
                      onClick={() => {
                        markRead([item]);
                        setOpen(false);
                      }}
                      className={`flex items-start gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-[var(--chip-bg)] ${
                        fresh ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          fresh ? "bg-[var(--red-tint)] text-[var(--red-active)]" : "bg-[var(--chip-bg)] text-[var(--muted)]"
                        }`}
                      >
                        <Icon size={16} strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 pr-14">
                        <span className={fresh ? "font-medium" : ""}>{label}</span>
                        {detail ? <span className="mt-0.5 block text-xs text-[var(--muted)]">{detail}</span> : null}
                      </span>
                      <span
                        className={`absolute right-4 top-3 rounded-full px-2 py-0.5 text-[11px] font-semibold group-hover/item:opacity-0 ${
                          fresh ? "bg-[var(--red)] text-white" : "bg-[var(--chip-bg)] text-[var(--muted)]"
                        }`}
                      >
                        {fresh ? `${fresh} new` : count}
                      </span>
                    </Link>
                    <div className="absolute right-2 top-2.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
                      {fresh ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markRead([item]);
                          }}
                          title="Mark as read"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--chip-bg)] hover:text-[var(--foreground)]"
                        >
                          <CheckCheck size={12} strokeWidth={2} aria-hidden />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          clear([item]);
                        }}
                        title="Dismiss"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--red-tint)] hover:text-[var(--red-active)]"
                      >
                        <Trash2 size={12} strokeWidth={2} aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <CircleCheck size={28} strokeWidth={1.5} className="text-[var(--badge-green-fg)]" aria-hidden />
              <p className="text-[13px] font-medium text-[var(--foreground)]">You&apos;re all caught up</p>
              <p className="text-xs text-[var(--muted)]">Nothing is waiting for you right now.</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
