"use client";

import { PortalLink as Link } from "@/components/layout/PortalLink";
import type { ReactNode } from "react";
import { Lightbulb } from "lucide-react";
import { useTourHints } from "../../hooks/useTourHints";
import { Button } from "../ui/Button";

/** Small header above a guided flow: what this guide is, extra page actions, a link to the full page, and "Show hints". */
export function GuideHeader({
  eyebrow,
  title,
  fullPage,
  actions,
}: {
  eyebrow: string;
  title: string;
  fullPage?: { href: string; label: string };
  /** Buttons shown next to "Show hints" (e.g. History) */
  actions?: ReactNode;
}) {
  const { anyDismissed, resetAll } = useTourHints();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--red)]">{eyebrow}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {fullPage ? (
          <Link href={fullPage.href} className="mr-2 font-medium text-[var(--muted)] hover:text-[var(--red-active)]">
            {fullPage.label}
          </Link>
        ) : null}
        {actions}
        {anyDismissed ? (
          <Button onClick={resetAll}>
            <span className="inline-flex items-center gap-1.5">
              <Lightbulb size={15} aria-hidden /> Show hints
            </span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
