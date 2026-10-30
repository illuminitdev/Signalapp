"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { usePortal } from "../../hooks/usePortal";
import { inPortal, isPortalPage } from "./portals";

/**
 * next/link that keeps links inside the member's own portal: `href="/accounts/pipeline"`
 * opens "/researcher/accounts/pipeline" for a researcher and "/admin/accounts/pipeline" for an admin.
 * A link to a page this portal doesn't have is not shown at all, so no screen leads into another portal.
 */
export function PortalLink({ href, ...props }: ComponentProps<typeof Link>) {
  const { portal, allows } = usePortal();
  if (typeof href !== "string" || !isPortalPage(href)) return <Link {...props} href={href} />;
  if (!allows(href)) return null;
  return <Link {...props} href={inPortal(portal.prefix, href)} />;
}
