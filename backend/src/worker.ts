import { getEnv } from "./config/env.js";
import { getBoss, JOB_IMPORT, JOB_RESEARCH } from "./jobs/queue.js";
import { handleCsvImport } from "./jobs/handlers/csvImport.js";
import { handleResearchRun } from "./jobs/handlers/researchRun.js";
import { JOB_CRM_SYNC, type CrmSyncJob } from "./jobs/crmQueue.js";
import { handleCrmSync } from "./jobs/handlers/crmSync.js";
import { enqueueDueMonitors, handleMonitorCheck, JOB_MONITOR_CHECK, type MonitorCheckJob } from "./jobs/monitorQueue.js";

async function main() {
  getEnv();
  const boss = await getBoss();
  await boss.createQueue(JOB_RESEARCH);
  await boss.createQueue(JOB_IMPORT);

  await boss.work<{ researchRunId: string }>(JOB_RESEARCH, { includeMetadata: true }, async ([job]) => {
    if (!job) return;
    await handleResearchRun(job.data, {
      retryCount: job.retryCount ?? 0,
      retryLimit: job.retryLimit ?? 0,
    });
  });

  await boss.work(JOB_IMPORT, async ([job]) => {
    await handleCsvImport(job.data as { importJobId: string; csvText: string });
  });

  await boss.createQueue(JOB_CRM_SYNC);
  await boss.work<CrmSyncJob>(JOB_CRM_SYNC, async ([job]) => {
    if (job) await handleCrmSync(job.data);
  });

  // Scheduled monitors: each due monitor becomes one queued job (locked per monitor, retried on outages)
  await boss.createQueue(JOB_MONITOR_CHECK);
  await boss.work<MonitorCheckJob>(JOB_MONITOR_CHECK, { includeMetadata: true }, async ([job]) => {
    if (job) await handleMonitorCheck(job.data, { retryCount: job.retryCount ?? 0 });
  });
  setInterval(async () => {
    try {
      await enqueueDueMonitors();
    } catch (err) {
      console.error("[monitor-scheduler]", err);
    }
  }, 60_000);

  console.log("Signal worker listening for research-run, csv-import, crm-sync, and active scheduled monitors");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
