import { useCallback, useRef } from "react"
import { flushAllQueuedCasePatches, getQueuedCasePatchSummary, reconcileQueue } from "./offline-case-patches"
import { flushPendingIntraopEvents } from "./pending-intraop-events"
import { getAllLocalCaseDrafts, deleteLocalCaseDraft } from "./local-case-store"
import { buildPreopPayload } from "./preop-payload"
import { apiFetch } from "./api"
import { useLiveRefresh } from "./use-live-refresh"

async function flushLocalCaseDrafts(): Promise<void> {
  const drafts = await getAllLocalCaseDrafts()
  for (const draft of drafts) {
    try {
      // Build the normalised payload (includes derived BMI, RCRI, Apfel, STOP-BANG)
      const preop = buildPreopPayload(draft.formValues)
      const res = await apiFetch("/api/cases", {
        method: "POST",
        body: JSON.stringify({ preop }),
      })
      if (res.ok) {
        await deleteLocalCaseDraft(draft.localId)
      }
    } catch {
      // Network still offline — leave draft in store, try next cycle
    }
  }
}

export function useQueuedSaveFlusher(enabled: boolean, onChange?: (count: number) => void) {
  const reconciledRef = useRef(false)

  const flush = useCallback(async () => {
    if (!enabled) return
    // Repair the queue index once at startup (crash-recovery: removes orphan entries)
    if (!reconciledRef.current) {
      reconciledRef.current = true
      await reconcileQueue()
    }
    // Flush local-first offline case drafts (initial creation failed while offline)
    await flushLocalCaseDrafts()
    // Flush queued patches for existing server cases
    await flushAllQueuedCasePatches()
    // Replay any intraop events captured offline (idempotent server-side)
    await flushPendingIntraopEvents()
    if (onChange) {
      const summary = await getQueuedCasePatchSummary()
      onChange(summary.count)
    }
  }, [enabled, onChange])

  useLiveRefresh(flush, { enabled, intervalMs: 15_000 })
}
