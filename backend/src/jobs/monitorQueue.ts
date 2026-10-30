import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { monitors } from "../db/schema/index.js";
import { findDueMonitors, isMonitorDue, runMonitorCheck } from "../services/monitors.js";
import { getBoss } from "./queue.js";

export const JOB_MONITOR_CHECK = "monitor-check";

export type MonitorCheckJob = { workspaceId: string; monitorId: string };

/**
 * Queue one check per due monitor. The singleton key keeps a monitor to one waiting job, so
 * several workers ticking at once don't pile up duplicates; provider outages retry with backoff.
 */
export async function enqueueDueMonitors() {
  const due = await findDueMonitors();
  if (!due.length) return 0;
  const b = await getBoss();
  await b.createQueue(JOB_MONITOR_CHECK);
  for (const m of due) {
    await b.send(JOB_MONITOR_CHECK, { workspaceId: m.workspaceId, monitorId: m.id } satisfies MonitorCheckJob, {
      singletonKey: `monitor:${m.id}`,
      retryLimit: 2,
      retryBackoff: true,
      expireInMinutes: 15,
    });
  }
  return due.length;
}

/** Worker handler. Throwing on a provider outage hands the job back to the queue for a retry. */
export async function handleMonitorCheck(job: MonitorCheckJob, attempt: { retryCount: number } = { retryCount: 0 }) {
  const db = getDb();
  const [mon] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, job.monitorId), eq(monitors.workspaceId, job.workspaceId)))
    .limit(1);
  // Removed, paused, or already checked by an earlier copy of this job: nothing to do
  if (!mon || mon.status !== "active") return;
  if (attempt.retryCount === 0 && !isMonitorDue(mon)) return;

  const result = await runMonitorCheck(job.workspaceId, job.monitorId);
  if (result.status === "provider_outage") {
    throw new Error("Research provider outage; the monitor check will be retried");
  }
}
