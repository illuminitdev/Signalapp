import type { CrmSyncJob } from "../crmQueue.js";
import { runSync } from "../../services/crmSync.js";

export async function handleCrmSync(data: CrmSyncJob) {
  await runSync(data);
}
