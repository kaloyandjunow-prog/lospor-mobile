import { clearAllLocalCaseDrafts } from "./local-case-store"
import { clearAllQueuedCasePatches } from "./offline-case-patches"
import { clearAllPendingIntraopEvents } from "./pending-intraop-events"

export async function clearLocalClinicalCache(): Promise<{ drafts: number; patches: number; intraopQueues: number }> {
  const [drafts, patches, intraopQueues] = await Promise.all([
    clearAllLocalCaseDrafts(),
    clearAllQueuedCasePatches(),
    clearAllPendingIntraopEvents(),
  ])
  return { drafts, patches, intraopQueues }
}
