"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * A floating dialog over the page. Closes on Escape, on the backdrop or the ✕; focus moves into
 * it on open and returns to the button that opened it on close; the page behind doesn't scroll.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Shown left of the title (e.g. a logo) */
  icon?: ReactNode;
  children: ReactNode;
  /** Buttons row at the bottom */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first field (or the panel itself)
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("input, select, textarea, button:not([data-modal-close])");
    (first ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      // Keep Tab inside the dialog
      if (e.key === "Tab" && panel) {
        const items = [...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")];
        if (!items.length) return;
        const firstEl = items[0]!;
        const lastEl = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const width = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
      <div className="fixed inset-0 bg-[rgba(23,44,64,0.45)] backdrop-blur-[2px]" aria-hidden onMouseDown={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${width} rounded-[16px] border border-[var(--line)] bg-white shadow-[0_24px_60px_-12px_rgba(23,44,64,0.35)] outline-none`}
      >
        <div className="flex items-start gap-3 border-b border-[var(--line)] px-6 py-5">
          {icon ? <span className="shrink-0">{icon}</span> : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[18px] font-semibold text-[var(--foreground)]">
              {title}
            </h2>
            {description ? <div className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{description}</div> : null}
          </div>
          <button
            type="button"
            data-modal-close
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--chip-bg)] hover:text-[var(--foreground)]"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
