"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CircleCheck, Clock, FileCheck2, Inbox, RotateCcw, type LucideIcon } from "lucide-react";
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
          href: "/sdr",
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
          href: "/sales-reviewer",
        })),
      );
    } else if (can("submit_review")) {
      jobs.push(
        listAccounts(workspaceId, { acceptanceState: "needs_research" }).then((r) => ({
          key: "returned",
          Icon: RotateCcw,
          label: "Briefs returned for more research",
          count: r.accounts.length,
          href: "/sales-reviewer",
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

  const total = items.reduce((n, i) => n + i.count, 0);
  const pending = items.filter((i) => i.count > 0);

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
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <p className="text-[13.5px] font-semibold text-[var(--foreground)]">Needs your attention</p>
            {total ? <span className="text-xs text-[var(--muted)]">{total} total</span> : null}
          </div>
          {pending.length ? (
            <ul className="py-1">
              {pending.map(({ key, Icon, label, count, href }) => (
                <li key={key}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-[var(--foreground)] hover:bg-[var(--chip-bg)]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--red-tint)] text-[var(--red-active)]">
                      <Icon size={16} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="flex-1">{label}</span>
                    <span className="rounded-full bg-[var(--chip-bg)] px-2 py-0.5 text-xs font-semibold">{count}</span>
                  </Link>
                </li>
              ))}
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
