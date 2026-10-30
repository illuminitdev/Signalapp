"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  CircleCheck,
  Clock,
  FileCheck2,
  Inbox,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { usePortal } from "../../hooks/usePortal";
import { useWorkspace } from "../../hooks/useWorkspace";
import { listAccounts } from "../../lib/api/accounts";
import { listTasks } from "../../lib/api/tasks";
import { listSharedHandoffs } from "../../lib/api/handoffs";

export type BellItem = { key: string; Icon: LucideIcon; label: string; count: number; href: string };

type StoredBellState = {
  readCounts: Record<string, number>;
  clearedCounts: Record<string, number>;
};

function readBellStorage(key: string): StoredBellState {
  if (typeof window === "undefined") return { readCounts: {}, clearedCounts: {} };
  try {
    const raw = localStorage.getItem(`signal:bell:${key}`);
    return raw ? JSON.parse(raw) : { readCounts: {}, clearedCounts: {} };
  } catch {
    return { readCounts: {}, clearedCounts: {} };
  }
}

function writeBellStorage(key: string, data: StoredBellState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`signal:bell:${key}`, JSON.stringify(data));
  } catch {}
}

/**
 * Header bell: work waiting for the signed-in person, computed from live data
 * for their role. Nothing is sent anywhere; it only links to the right queue.
 */
export function AttentionBell() {
  const { workspaceId, user, can } = useWorkspace();
  const { href: portalHref } = usePortal();
  const [items, setItems] = useState<BellItem[]>([]);

  const load = useCallback(async () => {
    if (!workspaceId || !user) return;
    const jobs: Array<Promise<BellItem | null>> = [];
    if (can("view_tasks")) {
      jobs.push(
        listTasks(workspaceId, { ownerUserId: user.id, due: "overdue" }).then((r) => ({
          key: "overdue",
          Icon: Clock,
          label: "Your overdue tasks",
          count: r.tasks.length,
          href: "/outreach/tasks",
        })),
      );
    }
    if (can("accept")) {
      jobs.push(
        listAccounts(workspaceId, { acceptanceState: "ready_for_review" }).then((r) => ({
          key: "review",
          Icon: FileCheck2,
          label: "Briefs waiting for your review",
          count: r.accounts.length,
          href: "/accounts/sales-acceptance",
        })),
      );
    } else if (can("submit_review")) {
      jobs.push(
        listAccounts(workspaceId, { acceptanceState: "needs_research" }).then((r) => ({
          key: "returned",
          Icon: RotateCcw,
          label: "Briefs returned for more research",
          count: r.accounts.length,
          href: "/accounts/qualify",
        })),
      );
    }
    if (can("acknowledge_handoff") && !can("view_accounts")) {
      jobs.push(
        listSharedHandoffs(workspaceId).then((r) => ({
          key: "handoffs",
          Icon: Inbox,
          label: "Handoffs waiting for you",
          count: r.handoffs.filter((h) => h.state === "shared").length,
          href: "/shared",
        })),
      );
    }
    const results = await Promise.allSettled(jobs);
    // Every link opens the queue inside this member's own portal
    setItems(results.flatMap((r) => (r.status === "fulfilled" && r.value ? [{ ...r.value, href: portalHref(r.value.href) }] : [])));
  }, [workspaceId, user, can, portalHref]);

  // Load once, then refresh every minute and when the panel opens
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

  const [state, setState] = useState<StoredBellState>({ readCounts: {}, clearedCounts: {} });
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount and when storageKey changes
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

  // An item is considered cleared/dismissed if its current count <= cleared count recorded
  const isCleared = (key: string, count: number) => {
    const cleared = state.clearedCounts[key];
    return cleared !== undefined && count <= cleared;
  };

  // An item is considered read if its current count <= read count recorded
  const isRead = (key: string, count: number) => {
    const read = state.readCounts[key];
    return read !== undefined && count <= read;
  };

  const visibleItems = items.filter((i) => !isCleared(i.key, i.count));
  const pending = visibleItems.filter((i) => i.count > 0);
  const unreadPending = pending.filter((i) => !isRead(i.key, i.count));

  // Badge count displays sum of unread pending counts (or 0 if none or loading)
  const total = loaded ? unreadPending.reduce((n, i) => n + i.count, 0) : 0;

  const markAllRead = () => {
    updateState((prev) => {
      const readCounts = { ...prev.readCounts };
      for (const item of pending) {
        readCounts[item.key] = item.count;
      }
      return { ...prev, readCounts };
    });
  };

  const clearAll = () => {
    updateState((prev) => {
      const clearedCounts = { ...prev.clearedCounts };
      for (const item of items) {
        clearedCounts[item.key] = item.count;
      }
      return { ...prev, clearedCounts };
    });
  };

  const markOneRead = (key: string, count: number) => {
    updateState((prev) => ({
      ...prev,
      readCounts: { ...prev.readCounts, [key]: count },
    }));
  };

  const clearOne = (key: string, count: number) => {
    updateState((prev) => ({
      ...prev,
      clearedCounts: { ...prev.clearedCounts, [key]: count },
    }));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={total ? `${total} items need your attention` : "Nothing needs your attention"}
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
        <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_12px_32px_rgba(23,44,64,0.12)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <p className="text-[13.5px] font-semibold text-[var(--foreground)]">Notifications</p>
            {pending.length > 0 ? (
              <span className="text-xs text-[var(--muted)]">
                {unreadPending.length} unread
              </span>
            ) : null}
          </div>

          {/* Action buttons */}
          {pending.length > 0 ? (
            <div className="flex items-center gap-1 border-b border-[var(--line)] px-3 py-2">
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadPending.length === 0}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--chip-bg)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--muted)]"
              >
                <CheckCheck size={13} strokeWidth={2} aria-hidden />
                Mark all read
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--red-tint)] hover:text-[var(--red-active)]"
              >
                <Trash2 size={13} strokeWidth={2} aria-hidden />
                Clear all
              </button>
            </div>
          ) : null}

          {/* Notification items */}
          {pending.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {pending.map(({ key, Icon, label, count, href }) => {
                const read = isRead(key, count);
                return (
                  <li key={key} className="group/item relative">
                    <Link
                      href={href}
                      onClick={() => {
                        markOneRead(key, count);
                        setOpen(false);
                      }}
                      className={`flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-[var(--chip-bg)] ${
                        read ? "text-[var(--muted)]" : "text-[var(--foreground)]"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          read
                            ? "bg-[var(--chip-bg)] text-[var(--muted)]"
                            : "bg-[var(--red-tint)] text-[var(--red-active)]"
                        }`}
                      >
                        <Icon size={16} strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="flex-1">
                        {label}
                        {!read ? (
                          <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--red)]" aria-label="Unread" />
                        ) : null}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          read ? "bg-[var(--chip-bg)] text-[var(--muted)]" : "bg-[var(--chip-bg)]"
                        }`}
                      >
                        {count}
                      </span>
                    </Link>
                    {/* Per-item action buttons on hover */}
                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
                      {!read ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markOneRead(key, count);
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
                          clearOne(key, count);
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
