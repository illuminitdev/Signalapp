"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SubNavItem = { href: string; label: string; exact?: boolean };

export function SubNav({ items }: { items: SubNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Section"
      className="mb-6 flex flex-wrap gap-1 border-b border-[var(--line)] pb-3"
    >
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={`rounded-[7px] px-3 py-1.5 text-sm font-medium ${
              active
                ? "bg-[var(--red-tint)] text-[var(--red-active)]"
                : "text-[var(--muted)] hover:bg-[var(--chip-bg)] hover:text-[var(--foreground)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
