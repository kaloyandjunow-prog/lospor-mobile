import { apiFetch } from "@/lib/api"
import type { LogEvent } from "@/lib/intraop-log-event"
import { serializeIntraopLogForServer } from "@/lib/pending-intraop-events"

type TimestampRef = { current: string | null }

type FullLogPutResult = {
  intraopUpdatedAt?: string
}

type PutAttemptResult =
  | { ok: true; body: FullLogPutResult }
  | { ok: false; conflict: true; serverUpdatedAt?: string }
  | { ok: false; conflict: false }

async function putFullLogOnce(
  caseId: string,
  log: LogEvent[],
  updatedAt: string | null,
): Promise<PutAttemptResult> {
  const res = await apiFetch(`/api/cases/${caseId}/events`, {
    method: "PUT",
    headers: updatedAt ? { "x-lospor-intraop-updated-at": updatedAt } : undefined,
    body: JSON.stringify(serializeIntraopLogForServer(log)),
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 409) {
    return {
      ok: false,
      conflict: true,
      serverUpdatedAt: body?.serverVersion?.updatedAt as string | undefined,
    }
  }
  if (!res.ok) return { ok: false, conflict: false }
  return { ok: true, body }
}

export async function putFullIntraopLogWithConflictRetry(
  caseId: string,
  log: LogEvent[],
  baseIntraopUpdatedAtRef: TimestampRef,
): Promise<FullLogPutResult> {
  let result = await putFullLogOnce(caseId, log, baseIntraopUpdatedAtRef.current)
  if (!result.ok && result.conflict && result.serverUpdatedAt) {
    baseIntraopUpdatedAtRef.current = result.serverUpdatedAt
    result = await putFullLogOnce(caseId, log, result.serverUpdatedAt)
  }
  if (!result.ok && result.conflict && result.serverUpdatedAt) {
    baseIntraopUpdatedAtRef.current = result.serverUpdatedAt
  }
  if (!result.ok) throw new Error("INTRAOP_FULL_LOG_SAVE_FAILED")
  baseIntraopUpdatedAtRef.current = result.body.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
  return result.body
}
