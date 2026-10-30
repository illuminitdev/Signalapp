import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { crmConnections, users, type CrmProviderKey } from "../db/schema/index.js";
import { getCrmConnection, providerFromConnection } from "../providers/crm/index.js";
import { HubspotCrmProvider } from "../providers/crm/hubspot.js";
import { CrmError } from "../providers/crm/types.js";
import { validationError, notFound } from "../utils/errors.js";
import { newId } from "../utils/ids.js";
import { redactString } from "../utils/redact.js";
import { encryptSecret, secretHint } from "../utils/secrets.js";
import { writeAudit } from "./audit.js";

/** CRMs shown in Settings. Only those with `available: true` can be connected today. */
export const CRM_CATALOG: Array<{ key: CrmProviderKey; name: string; available: boolean; credentialHelp: string }> = [
  {
    key: "hubspot",
    name: "HubSpot",
    available: true,
    credentialHelp:
      "In HubSpot: Settings → Integrations → Private apps → Create a private app. Give it CRM read/write scopes for companies, contacts and deals, then copy its access token.",
  },
  { key: "salesforce", name: "Salesforce", available: false, credentialHelp: "Coming soon" },
  { key: "other", name: "Other CRM", available: false, credentialHelp: "Coming soon" },
];

/** What anyone in the company may see about the connection: never the credential itself. */
export async function getConnectionView(tenantId: string) {
  const conn = await getCrmConnection(tenantId);
  if (!conn) return null;
  const db = getDb();
  const [by] = await db.select({ name: users.name }).from(users).where(eq(users.id, conn.connectedBy)).limit(1);
  return {
    provider: conn.provider,
    providerName: CRM_CATALOG.find((c) => c.key === conn.provider)?.name ?? conn.provider,
    status: conn.status as "connected" | "failed",
    credentialHint: conn.credentialHint,
    accountLabel: conn.externalAccountLabel,
    lastCheckedAt: conn.lastCheckedAt,
    lastError: conn.lastError,
    connectedAt: conn.createdAt,
    connectedByName: by?.name ?? null,
  };
}

/** Readable reason a CRM refused a credential. */
function connectError(err: unknown) {
  if (err instanceof CrmError && (err.status === 401 || err.status === 403)) {
    return "HubSpot refused this token. Check it was copied in full and that the private app has CRM scopes for companies, contacts and deals.";
  }
  return redactString(err instanceof Error ? err.message : "Could not reach the CRM");
}

/** Connect (or replace) the company's CRM. The credential is checked against the CRM before it's saved. */
export async function connectCrm(input: { tenantId: string; workspaceId: string; actorUserId: string; provider: string; credential: string }) {
  const entry = CRM_CATALOG.find((c) => c.key === input.provider);
  if (!entry) throw validationError("Unknown CRM");
  if (!entry.available) throw validationError(`${entry.name} isn't available yet`);
  const credential = input.credential.trim();

  let account: { id: string; label: string };
  try {
    account = await new HubspotCrmProvider(credential, null).describeAccount();
  } catch (err) {
    throw validationError(connectError(err));
  }

  const db = getDb();
  const now = new Date();
  const values = {
    provider: entry.key,
    encryptedCredential: encryptSecret(credential),
    credentialHint: secretHint(credential),
    externalAccountId: account.id,
    externalAccountLabel: account.label,
    status: "connected",
    lastCheckedAt: now,
    lastError: null,
    connectedBy: input.actorUserId,
    updatedAt: now,
  };
  await db
    .insert(crmConnections)
    .values({ id: newId("crmc"), tenantId: input.tenantId, ...values, createdAt: now })
    .onConflictDoUpdate({ target: crmConnections.tenantId, set: { ...values, createdAt: now } });

  await writeAudit({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "crm.connected",
    entityType: "crm_connection",
    entityId: input.tenantId,
    metadata: { provider: entry.key, account: account.label },
  });
  return getConnectionView(input.tenantId);
}

/** Re-check the stored credential still works, and record the result. */
export async function testCrmConnection(tenantId: string) {
  const conn = await getCrmConnection(tenantId);
  if (!conn) throw notFound("No CRM is connected");
  const db = getDb();
  const now = new Date();
  try {
    const provider = providerFromConnection(conn);
    const account = provider instanceof HubspotCrmProvider ? await provider.describeAccount() : null;
    await db
      .update(crmConnections)
      .set({
        status: "connected",
        lastCheckedAt: now,
        lastError: null,
        ...(account ? { externalAccountId: account.id, externalAccountLabel: account.label } : {}),
        updatedAt: now,
      })
      .where(eq(crmConnections.tenantId, tenantId));
  } catch (err) {
    await db
      .update(crmConnections)
      .set({ status: "failed", lastCheckedAt: now, lastError: connectError(err), updatedAt: now })
      .where(eq(crmConnections.tenantId, tenantId));
  }
  return getConnectionView(tenantId);
}

/** Remove the company's CRM connection. Records already sent stay in the CRM; nothing more is sent. */
export async function disconnectCrm(input: { tenantId: string; workspaceId: string; actorUserId: string }) {
  const conn = await getCrmConnection(input.tenantId);
  if (!conn) return null;
  const db = getDb();
  await db.delete(crmConnections).where(eq(crmConnections.tenantId, input.tenantId));
  await writeAudit({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "crm.disconnected",
    entityType: "crm_connection",
    entityId: input.tenantId,
    metadata: { provider: conn.provider },
  });
  return null;
}
