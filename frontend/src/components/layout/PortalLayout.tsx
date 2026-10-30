"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "./AppShell";
import { portalForRole, portalHome, sectionOf, toPortalPath, visibleSections } from "./portals";
import { LoadingState } from "../common/LoadingState";
import { useWorkspace, WorkspaceProvider } from "../../hooks/useWorkspace";

/** Forced password change (temporary password) happens here, before any portal opens. */
const FORCED_PASSWORD_PATH = "/password";

/**
 * Where this member should be instead of `pathname`, or null when they may stay. Members only
 * ever see their own role's portal: a page from another portal (or an old link without a
 * prefix) moves to the same page in their portal when they have it, otherwise to their home.
 */
function redirectFor(
  pathname: string,
  search: string,
  role: string | null,
  can: Parameters<typeof visibleSections>[1],
): string | null {
  const portal = portalForRole(role);
  if (!portal) return null;
  if (pathname === FORCED_PASSWORD_PATH) return portalHome(portal, can);
  const path = toPortalPath(pathname);
  const allowed = path !== "/" && Boolean(sectionOf(visibleSections(portal, can), path));
  const inOwnPortal = pathname.startsWith(`${portal.prefix}/`);
  if (inOwnPortal && allowed) return null;
  return allowed ? portal.prefix + path + search : portalHome(portal, can);
}

function PortalInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaceId, loading, error, unauthorized, can, role, user } = useWorkspace();
  const onForcedPasswordPage = pathname === FORCED_PASSWORD_PATH;
  const mustChange = Boolean(user?.mustChangePassword);

  // The platform admin has no workspace; their home is the platform console
  const toPlatform = !loading && !mustChange && Boolean(user?.isPlatformAdmin) && !workspaceId;
  const search = typeof window === "undefined" ? "" : window.location.search;
  const portalTarget = !loading && !mustChange && workspaceId ? redirectFor(pathname, search, role, can) : null;
  const target = toPlatform
    ? "/platform"
    : mustChange && !onForcedPasswordPage
      ? FORCED_PASSWORD_PATH
      : portalTarget;

  useEffect(() => {
    if (unauthorized) router.replace("/login");
    else if (target) router.replace(target);
  }, [unauthorized, target, router]);

  if (unauthorized || target) {
    return <LoadingState label="Redirecting…" />;
  }

  // Forced password change happens outside the workspace shell
  if (mustChange && onForcedPasswordPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
        <div className="w-full max-w-md">{children}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <LoadingState label="Loading workspace…" />
      </div>
    );
  }

  if (error && !workspaceId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
        <p className="text-sm text-[var(--red)]" role="alert">
          {error}
        </p>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}

/** Shared shell for authenticated workspace routes — workspace loads once per session. */
export function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <PortalInner>{children}</PortalInner>
    </WorkspaceProvider>
  );
}
