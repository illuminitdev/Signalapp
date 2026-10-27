import type { ReactNode } from "react";

export const inputClass =
  "mt-1.5 w-full rounded-[7px] border border-[var(--input-border)] bg-white px-3 py-2 text-sm font-normal text-[var(--foreground)]";

/** Label wrapper so every control has a programmatic label. */
export function Field({
  label,
  hint,
  required,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  /** Shows a red asterisk; the control itself still needs `required`. */
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-xs font-semibold text-[var(--muted)] ${className}`}>
      {label}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 text-[var(--red)]">
          *
        </span>
      ) : null}
      {children}
      {hint ? <span className="mt-1 block font-normal">{hint}</span> : null}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-[var(--red-active)]">
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="mt-3 rounded-[7px] bg-[var(--badge-green-bg)] p-3 text-sm font-medium text-[var(--badge-green-fg)]">
      {message}
    </p>
  );
}

/** Turns snake_case keys into readable labels. */
export function humanize(key: string): string {
  const s = key.replace(/^fact:/, "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
