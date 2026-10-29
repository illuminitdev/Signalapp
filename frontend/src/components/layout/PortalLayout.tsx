"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, homeFor, inSection, visibleSections } from "./AppShell";
import { LoadingState } from "../common/LoadingState";
import { useWorkspace, WorkspaceProvider } from "../../hooks/useWorkspace";

function PortalInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaceId, loading, error, unauthorized, can, user } = useWorkspace();
  const onPasswordPage = pathname === "/settings/password";
  const mustChange = Boolean(user?.mustChangePassword);

  // Send each role to a section it can use (e.g. partners → shared handoffs)
  const sections = workspaceId ? visibleSections(can) : [];
  const allowedHere =
    sections.some((s) => inSection(s, pathname)) || pathname === "/settings/how-it-works" || onPasswordPage;
  // The platform admin has no workspace; their home is the platform console
  const toPlatform = !loading && !mustChange && Boolean(user?.isPlatformAdmin) && !workspaceId;
  const needsRedirect = toPlatform || (mustChange && !onPasswordPage) || (Boolean(workspaceId) && !allowedHere);

  useEffect(() => {
    if (unauthorized) router.replace("/login");
    else if (needsRedirect)
      router.replace(toPlatform ? "/platform" : mustChange ? "/settings/password" : homeFor(can));
  }, [unauthorized, needsRedirect, toPlatform, mustChange, router, can]);

  if (unauthorized || needsRedirect) {
    return <LoadingState label="Redirecting…" />;
  }

  // Forced password change happens outside the workspace shell
  if (mustChange && onPasswordPage) {
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
