import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { crmConnections } from "../../db/schema/index.js";
import { crmNotConnected } from "../../utils/errors.js";
import { decryptSecret } from "../../utils/secrets.js";
import { HubspotCrmProvider } from "./hubspot.js";
import type { CrmProvider } from "./types.js";

let override: CrmProvider | null = null;

/** Test hook: replace the live CRM with a fake (never used in production paths). */
export function setCrmProviderForTests(provider: CrmProvider | null) {
  override = provider;
}

/** The company's own CRM connection row, if it has one. */
export async function getCrmConnection(tenantId: string) {
  const db = getDb();
  const [row] = await db.select().from(crmConnections).where(eq(crmConnections.tenantId, tenantId)).limit(1);
  return row ?? null;
}

/** Build the adapter for a stored connection. Only providers with an adapter can be built. */
export function providerFromConnection(conn: { provider: string; encryptedCredential: string; externalAccountId: string | null }): CrmProvider {
  if (conn.provider === "hubspot") {
    return new HubspotCrmProvider(decryptSecret(conn.encryptedCredential), conn.externalAccountId);
  }
  throw crmNotConnected();
}

/** The CRM adapter for this company, using its own credentials (each company connects its own CRM). */
export async function getCrmProvider(tenantId: string): Promise<CrmProvider> {
  if (override) return override;
  const conn = await getCrmConnection(tenantId);
  if (!conn) throw crmNotConnected();
  return providerFromConnection(conn);
}

export async function isCrmConfigured(tenantId: string): Promise<boolean> {
  if (override) return true;
  const conn = await getCrmConnection(tenantId);
  return Boolean(conn && conn.provider === "hubspot");
}

export async function crmProviderStatus(tenantId: string) {
  if (override) return { provider: override.name, configured: true, accountLabel: null as string | null };
  const conn = await getCrmConnection(tenantId);
  return {
    provider: conn?.provider ?? null,
    configured: Boolean(conn && conn.provider === "hubspot"),
    accountLabel: conn?.externalAccountLabel ?? null,
  };
}

export type { CrmProvider } from "./types.js";
export { CrmError } from "./types.js";
