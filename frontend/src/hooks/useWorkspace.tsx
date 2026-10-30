"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { listWorkspaces, me, type User, type WorkspaceMembership } from "../lib/auth/session";
import type { Capability } from "../lib/auth/capabilities";
import { ApiError } from "../lib/api/client";

const KEY = "signal_workspace_id";

type WorkspaceState = {
  workspaceId: string | null;
  workspaceName: string | null;
  role: string | null;
  currency: string;
  user: User | null;
  workspaces: WorkspaceMembership[];
  /** Capabilities granted by the server for the selected workspace */
  can: (cap: Capability) => boolean;
  selectWorkspace: (id: string) => void;
  loading: boolean;
  error: string | null;
  unauthorized: boolean;
  refresh: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceState | null>(null);

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // storage unavailable — selection falls back to the first workspace
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>([]);
  const [selected, setSelected] = useState<WorkspaceMembership | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const refresh = useCallback(async () => {
    try {
      // Both requests in parallel; the workspace list is refused while a temporary password is active
      const [meRes, wsRes] = await Promise.allSettled([me(), listWorkspaces()]);
      if (meRes.status === "rejected") throw meRes.reason;
      const u = meRes.value.user;
      setUser(u);
      if (u.mustChangePassword) {
        setUnauthorized(false);
        setError(null);
        return;
      }
      if (wsRes.status === "rejected") throw wsRes.reason;
      const list = wsRes.value.workspaces;
      setWorkspaces(list);
      const stored = readStored();
      const pick = list.find((w) => w.id === stored) ?? list[0] ?? null;
      setSelected(pick);
      setUnauthorized(false);
      if (pick) {
        writeStored(pick.id);
        setError(null);
      } else if (u.isPlatformAdmin) {
        // The platform admin belongs to no workspace by design; PortalLayout sends them to /platform
        setError(null);
      } else {
        setError("You don't have access to any workspace. Ask a workspace admin to add you.");
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUnauthorized(true);
        setError(null);
        setSelected(null);
      } else {
        setError(e instanceof Error ? e.message : "Failed to load workspaces");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectWorkspace = useCallback(
    (id: string) => {
      const next = workspaces.find((w) => w.id === id);
      if (!next) return;
      writeStored(id);
      setSelected(next);
    },
    [workspaces],
  );

  const value = useMemo<WorkspaceState>(() => {
    const caps = new Set(selected?.capabilities ?? []);
    return {
      workspaceId: selected?.id ?? null,
      workspaceName: selected?.name ?? null,
      role: selected?.role ?? null,
      currency: selected?.currency ?? "GBP",
      user,
      workspaces,
      can: (cap) => caps.has(cap),
      selectWorkspace,
      loading,
      error,
      unauthorized,
      refresh,
    };
  }, [selected, user, workspaces, selectWorkspace, loading, error, unauthorized, refresh]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}

/** Signed-in user's id, or null outside the workspace portal (login, platform console). */
export function useOptionalUserId(): string | null {
  return useContext(WorkspaceContext)?.user?.id ?? null;
}
