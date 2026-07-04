import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react"

import { ApiError } from "@/lib/api"
import { notify } from "@/lib/notify"
import { saveCasePatchWithQueue } from "@/lib/offline-case-patches"

type SyncState = "saved" | "saving" | "failed" | "offline"

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
  return useCallback(async (payload: Record<string, unknown>) => {
    pendingSaveCountRef.current += 1
    setSyncState("saving")
    try {
      const result = await saveCasePatchWithQueue(caseId, "intraop", payload, baseIntraopUpdatedAtRef.current)
      if (result.result === "saved") {
        baseIntraopUpdatedAtRef.current = result.response?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
        setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
        setSyncState("saved")
      } else if (result.result === "queued") {
        setSyncState("offline")
      }
      return result
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const serverUpdatedAt = (err.serverVersion as any)?.updatedAt as string | undefined
        if (serverUpdatedAt) {
          baseIntraopUpdatedAtRef.current = serverUpdatedAt
          try {
            const retryResult = await saveCasePatchWithQueue(caseId, "intraop", payload, serverUpdatedAt)
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
    } finally {
      pendingSaveCountRef.current -= 1
    }
  }, [baseIntraopUpdatedAtRef, caseId, pendingSaveCountRef, setLastSavedAt, setSyncState])
}
