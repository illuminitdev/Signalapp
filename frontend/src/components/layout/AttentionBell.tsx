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
import { useWorkspace } from "../../hooks/useWorkspace";
import { listAccounts } from "../../lib/api/accounts";
import { listTasks } from "../../lib/api/tasks";
import { listSharedHandoffs } from "../../lib/api/handoffs";

export type BellItem = { key: string; Icon: LucideIcon; label: string; count: number; href: string };

/**
 * Header bell: work waiting for the signed-in person, computed from live data
 * for their role. Nothing is sent anywhere; it only links to the right queue.
 */
export function AttentionBell() {
  const { workspaceId, user, can } = useWorkspace();
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
          href: "/accounts/sales-acceptance",
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
          href: "/partner",
        })),
      );
    }
    const results = await Promise.allSettled(jobs);
    setItems(results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : [])));
  }, [workspaceId, user, can]);

  // Load once, then refresh every minute and when the panel opens
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  return <BellMenu items={items} onOpen={() => void load()} />;
}

/** Bell button with a count badge and a dropdown of linked items. */
export function BellMenu({ items, onOpen }: { items: BellItem[]; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Track which keys have been marked as read (dimmed but still visible)
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());
  // Track which keys have been cleared/dismissed (hidden)
  const [clearedKeys, setClearedKeys] = useState<Set<string>>(new Set());

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

  // Filter out cleared items
  const visibleItems = items.filter((i) => !clearedKeys.has(i.key));
  const pending = visibleItems.filter((i) => i.count > 0);
  const unreadPending = pending.filter((i) => !readKeys.has(i.key));
  // Badge count only includes unread + uncleaned items
  const total = unreadPending.reduce((n, i) => n + i.count, 0);

  const markAllRead = () => {
    setReadKeys(new Set(pending.map((i) => i.key)));
  };

  const clearAll = () => {
    setClearedKeys(new Set(items.map((i) => i.key)));
    setReadKeys(new Set());
  };

  const markOneRead = (key: string) => {
    setReadKeys((prev) => new Set([...prev, key]));
  };

  const clearOne = (key: string) => {
    setClearedKeys((prev) => new Set([...prev, key]));
  };

  // When items refresh (new data), remove stale cleared/read keys that no longer exist
  // and un-clear items that have a new (higher) count
  const prevItemsRef = useRef<BellItem[]>([]);
  useEffect(() => {
    const prevMap = new Map(prevItemsRef.current.map((i) => [i.key, i]));
    // If an item reappears with a different (higher) count, un-clear and un-read it
    for (const item of items) {
      const prev = prevMap.get(item.key);
      if (prev && item.count > prev.count) {
        setClearedKeys((s) => {
          const next = new Set(s);
          next.delete(item.key);
          return next;
        });
        setReadKeys((s) => {
          const next = new Set(s);
          next.delete(item.key);
          return next;
        });
      }
    }
    prevItemsRef.current = items;
  }, [items]);

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
                const isRead = readKeys.has(key);
                return (
                  <li key={key} className="group/item relative">
                    <Link
                      href={href}
                      onClick={() => {
                        markOneRead(key);
                        setOpen(false);
                      }}
                      className={`flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-[var(--chip-bg)] ${
                        isRead ? "text-[var(--muted)]" : "text-[var(--foreground)]"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          isRead
                            ? "bg-[var(--chip-bg)] text-[var(--muted)]"
                            : "bg-[var(--red-tint)] text-[var(--red-active)]"
                        }`}
                      >
                        <Icon size={16} strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="flex-1">
                        {label}
                        {!isRead ? (
                          <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--red)]" aria-label="Unread" />
                        ) : null}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          isRead ? "bg-[var(--chip-bg)] text-[var(--muted)]" : "bg-[var(--chip-bg)]"
                        }`}
                      >
                        {count}
                      </span>
                    </Link>
                    {/* Per-item action buttons on hover */}
                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
                      {!isRead ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markOneRead(key);
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
                          clearOne(key);
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
