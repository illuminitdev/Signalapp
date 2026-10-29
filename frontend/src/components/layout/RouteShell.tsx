"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { PortalLayout } from "./PortalLayout";

/** Every portal folder shares one workspace shell, so it loads once per session. */
export function RouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // `/` redirects to login; `/login` and `/platform` bring their own layout.tsx.
  if (pathname === "/" || /^\/(login|platform)(\/|$)/.test(pathname)) {
    return <>{children}</>;
  }

  // Suspense: detail pages read `?id=` with useSearchParams
  return (
    <PortalLayout>
      <Suspense>{children}</Suspense>
    </PortalLayout>
  );
}
