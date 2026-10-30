"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { CrmConnectionCard } from "@/components/settings/CrmConnectionCard";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getConnections } from "@/lib/api/settings";

function ConnectCrmView({ workspaceId }: { workspaceId: string }) {
  const { can } = useWorkspace();
  // Whether CRM sync is switched on for this workspace (shown on the connection badge)
  const [syncEnabled, setSyncEnabled] = useState(true);

  useEffect(() => {
    getConnections(workspaceId)
      .then((d) => setSyncEnabled(d.crm.enabled))
      .catch(() => undefined);
  }, [workspaceId]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Connect to CRM"
        description="Connect your company's own CRM so accepted leads can be sent to it. One connection is shared by all of your company's workspaces."
      />
      <CrmConnectionCard workspaceId={workspaceId} canManage={can("manage_settings")} syncEnabled={syncEnabled} />
    </div>
  );
}

export default function ConnectCrmPage() {
  return (
    <RequireCap anyOf={["manage_settings", "manage_integrations"]}>
      {(workspaceId) => <ConnectCrmView workspaceId={workspaceId} />}
    </RequireCap>
  );
}
