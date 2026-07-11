// Thin adapter over the shared conflict-retry engine in @lospor/core/sync:
// full intraop-log PUT with the standard "409 → adopt server timestamp →
// retry once" dance. Mobile policy: always self-heal (last-writer-wins).
import { apiFetch } from "@/lib/api"
import type { LogEvent } from "@/lib/intraop-log-event"
import { serializeIntraopLogForServer } from "@/lib/pending-intraop-events"
import {
  classifyPatchResponse,
  saveWithConflictRetry,
  SECTION_CONFLICT_HEADER,
  type TimestampRef,
} from "@lospor/core/sync"

type FullLogPutResult = {
  intraopUpdatedAt?: string
}

export async function putFullIntraopLogWithConflictRetry(
  caseId: string,
  log: LogEvent[],
  baseIntraopUpdatedAtRef: TimestampRef,
): Promise<FullLogPutResult> {
  const outcome = await saveWithConflictRetry<FullLogPutResult>(
    async (baseUpdatedAt) => {
      const res = await apiFetch(`/api/cases/${caseId}/events`, {
        method: "PUT",
        headers: baseUpdatedAt ? { [SECTION_CONFLICT_HEADER.intraop]: baseUpdatedAt } : undefined,
        body: JSON.stringify(serializeIntraopLogForServer(log)),
      })
      return classifyPatchResponse<FullLogPutResult>(res)
    },
    baseIntraopUpdatedAtRef,
    (body) => body.intraopUpdatedAt,
  )
  if (!outcome.ok) throw new Error("INTRAOP_FULL_LOG_SAVE_FAILED")
  return outcome.body
}
