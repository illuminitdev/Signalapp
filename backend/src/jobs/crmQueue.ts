import { getBoss } from "./queue.js";

export const JOB_CRM_SYNC = "crm-sync";

export type CrmSyncJob = { tenantId: string; workspaceId: string; accountId: string; actorUserId: string };

/** One queued sync per account at a time: a second click while queued is a no-op (idempotent). */
export async function enqueueCrmSync(job: CrmSyncJob) {
  const b = await getBoss();
  await b.createQueue(JOB_CRM_SYNC);
  await b.send(JOB_CRM_SYNC, job, {
    singletonKey: `crm:${job.accountId}`,
    // The adapter already retries rate limits and server errors; failures are then shown as Failed
    retryLimit: 0,
    expireInMinutes: 15,
  });
}
