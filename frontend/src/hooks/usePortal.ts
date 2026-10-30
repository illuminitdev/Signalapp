"use client";

import { useCallback } from "react";
import { inPortal, PORTALS, portalForRole, sectionOf, visibleSections, type Portal } from "../components/layout/portals";
import { useWorkspace } from "./useWorkspace";

/**
 * The signed-in member's own portal. `href("/accounts/detail?id=1")` turns a page path into a
 * link inside that portal ("/researcher/accounts/detail?id=1"), so links never cross portals;
 * `allows(path)` says whether the portal has that page at all.
 */
export function usePortal(): { portal: Portal; href: (path: string) => string; allows: (path: string) => boolean } {
  const { role, can } = useWorkspace();
  const portal = portalForRole(role) ?? PORTALS.analyst;
  const href = useCallback((path: string) => inPortal(portal.prefix, path), [portal]);
  const allows = useCallback(
    (path: string) => Boolean(sectionOf(visibleSections(portal, can), path.split(/[?#]/)[0]!)),
    [portal, can],
  );
  return { portal, href, allows };
}
