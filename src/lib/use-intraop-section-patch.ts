import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react"

import { ApiError } from "@/lib/api"
import { notify } from "@/lib/notify"
import { saveCasePatchWithQueue, type CasePatchResponse, type CasePatchResult } from "@/lib/offline-case-patches"
import { createCoalescingBatcher, type CoalescingBatcher } from "@lospor/core/sync"

type SyncState = "saved" | "saving" | "failed" | "offline"

type PatchOutcome = { result: CasePatchResult; response?: CasePatchResponse } | undefined

type UseIntraopSectionPatchArgs = {
  caseId: string
  baseIntraopUpdatedAtRef: MutableRefObject<string | null>
  pendingSaveCountRef: MutableRefObject<number>
  setSyncState: Dispatch<SetStateAction<SyncState>>
  setLastSavedAt: Dispatch<SetStateAction<string | null>>
}

export function useIntraopSectionPatch({
  caseId,
  baseIntraopUpdatedAtRef,
  pendingSaveCountRef,
  setSyncState,
  setLastSavedAt,
}: UseIntraopSectionPatchArgs) {
  // Rapid taps (positions, monitoring, techniques, complication toggles) used
  // to fire one PATCH each; the later ones executed with a base timestamp
  // captured at tap time and 409'd against their own predecessor. Two fixes:
  //  1. taps coalesce — one merged PATCH ~500ms after the last tap
  //  2. the base is a THUNK resolved inside the write queue at execution time
  const runSave = useCallback(async (payload: Record<string, unknown>): Promise<PatchOutcome> => {
    try {
      const result = await saveCasePatchWithQueue(caseId, "intraop", payload, () => baseIntraopUpdatedAtRef.current)
      if (result.result === "saved") {
        baseIntraopUpdatedAtRef.current = result.response?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
        setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
        setSyncState("saved")
      } else if (result.result === "queued") {
        setSyncState("offline")
      }
      return result
    } catch (err) {
      // Safety net for genuine cross-writer staleness (e.g. an event save
      // bumped intraop.updatedAt mid-flight): adopt the server timestamp and
      // retry once.
      if (err instanceof ApiError && err.status === 409) {
        const serverUpdatedAt = (err.serverVersion as { updatedAt?: string } | undefined)?.updatedAt
        if (serverUpdatedAt) {
          baseIntraopUpdatedAtRef.current = serverUpdatedAt
          try {
            const retryResult = await saveCasePatchWithQueue(caseId, "intraop", payload, () => baseIntraopUpdatedAtRef.current)
            if (retryResult.result === "saved") {
              baseIntraopUpdatedAtRef.current = retryResult.response?.intraopUpdatedAt ?? serverUpdatedAt
              setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
              setSyncState("saved")
              return retryResult
            }
          } catch {
            // fall through to failed state
          }
        }
        setSyncState("failed")
      } else {
        setSyncState("failed")
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          notify("Save rejected", err.message)
        }
      }
      return undefined
    }
  }, [baseIntraopUpdatedAtRef, caseId, setLastSavedAt, setSyncState])

  const runSaveRef = useRef(runSave)
  useEffect(() => { runSaveRef.current = runSave }, [runSave])

  const batcherRef = useRef<CoalescingBatcher<PatchOutcome> | null>(null)
  if (!batcherRef.current) {
    batcherRef.current = createCoalescingBatcher<PatchOutcome>((merged) => runSaveRef.current(merged), 500)
  }

  return useCallback((payload: Record<string, unknown>): Promise<PatchOutcome> => {
    // The badge shows "saving" and live-refresh clobber protection engages
    // from the FIRST tap, even though the request goes out after the settle.
    pendingSaveCountRef.current += 1
    setSyncState("saving")
    return batcherRef.current!.submit(payload).finally(() => {
      pendingSaveCountRef.current -= 1
    })
  }, [pendingSaveCountRef, setSyncState])
}
