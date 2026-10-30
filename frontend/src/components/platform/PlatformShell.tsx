"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, Boxes, LayoutDashboard, LogOut, Settings, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { logout, me, type User } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/client";
import { LoadingState } from "@/components/common/LoadingState";
import { PlatformBell } from "./PlatformBell";

const NAV: Array<{ href: string; label: string; Icon: LucideIcon; exact?: boolean }> = [
  { href: "/platform", label: "Overview", Icon: LayoutDashboard, exact: true },
  { href: "/platform/companies", label: "Companies", Icon: Building2 },
  { href: "/platform/workspaces", label: "Workspaces", Icon: Boxes },
  { href: "/platform/users", label: "Users", Icon: Users },
  { href: "/platform/settings", label: "Settings", Icon: Settings },
];

/** App owner's shell: same look as the workspace AppShell, but outside any tenant. */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    me()
      .then(({ user: u }) => {
        if (u.mustChangePassword) return router.replace("/settings/password");
        if (!u.isPlatformAdmin) return router.replace("/discover/feed");
        setUser(u);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
        else setError(e instanceof Error ? e.message : "Could not load your account");
      });
  }, [router]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        {error ? (
          <p className="text-sm text-[var(--red)]" role="alert">
            {error}
          </p>
        ) : (
          <LoadingState label="Loading platform…" />
        )}
      </div>
    );
  }

  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
      <div className="min-h-screen bg-[var(--background)]">
        <aside className="fixed inset-y-0 left-0 z-30 flex w-[var(--sidebar-width)] flex-col border-r border-[var(--line)] bg-white">
          {/* Brand */}
          <Link href="/platform" prefetch className="flex h-16 shrink-0 items-center gap-2.5 px-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--red)] to-[var(--red-active)] text-white shadow-[0_2px_6px_rgba(187,33,48,0.35)]">
              <span className="text-[16px] font-bold leading-none" aria-hidden>
                S
              </span>
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">SignalApp</span>
          </Link>

          {/* Scope card, in place of the workspace switcher */}
          <div className="px-3">
            <div className="flex items-center gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
                <ShieldCheck size={15} strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">Scope</p>
                <p className="truncate text-[13px] font-semibold leading-tight text-[var(--foreground)]">All companies</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav aria-label="Primary" className="mt-5 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
            <p className="px-3 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">Platform</p>
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              const Icon = item.Icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors ${
                    active
                      ? "bg-[var(--red-tint)] text-[var(--red-active)]"
                      : "text-[#3d4a57] hover:bg-[var(--chip-bg)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {active ? (
                    <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--red-active)]" aria-hidden />
                  ) : null}
                  <Icon
                    size={18}
                    strokeWidth={1.75}
                    aria-hidden
                    className={`shrink-0 ${active ? "text-[var(--red-active)]" : "text-[#7a8794] group-hover:text-[var(--foreground)]"}`}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Profile */}
          <div className="border-t border-[var(--line)] p-3">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-[12px] font-semibold text-white">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[var(--foreground)]">{user.name}</p>
                <p className="truncate text-[11.5px] text-[var(--muted)]">Platform admin</p>
              </div>
            </div>
            <button
              type="button"
              className="mt-1 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] text-[12.5px] font-medium text-[#3d4a57] transition-colors hover:border-[var(--red-tint)] hover:bg-[var(--red-tint)] hover:text-[var(--red-active)]"
              onClick={() => {
                // Leave immediately; the session is ended on the server in the background
                void logout().catch(() => undefined);
                router.replace("/login");
              }}
            >
              <LogOut size={14} strokeWidth={1.75} aria-hidden />
              Log out
            </button>
          </div>
        </aside>

        <div className="ml-[var(--sidebar-width)] min-h-screen">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-end gap-3 border-b border-[var(--line)] bg-white/95 px-8 backdrop-blur">
            <PlatformBell />
          </header>
          <main className="mx-auto max-w-[1450px] px-[34px] py-8">{children}</main>
        </div>
      </div>
  );
}
