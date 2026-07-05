import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import * as Haptics from "expo-haptics"

import { apiFetch } from "@/lib/api"
import { notify } from "@/lib/notify"
import type { TimetableData } from "@/components/IntraopTimetable"
import { createSingleFlightQueue } from "@/lib/single-flight-queue"
import {
  eventsToTimetable,
  roundDown5Min,
} from "@/lib/intraop-projection"
import {
  loadPendingIntraopEvents,
  markIntraopEventFailed,
  markIntraopEventSynced,
  prependPendingIntraopEvent,
  removePendingIntraopEvent,
  serializeIntraopEventForServer,
  serializeIntraopLogForServer,
  stripIntraopLogSyncStatuses,
  storePendingIntraopEvents,
} from "@/lib/pending-intraop-events"
import { uid, type LogEvent } from "@/lib/intraop-log-event"

type SyncState = "saved" | "saving" | "failed" | "offline"

type UseIntraopEventPersistenceArgs = {
  caseId: string
  entryTs: string | null
  setEntryTs: Dispatch<SetStateAction<string | null>>
  log: LogEvent[]
  logRef: MutableRefObject<LogEvent[]>
  startRef: MutableRefObject<Date | null>
  legacyWebLogNeedsSyncRef: MutableRefObject<boolean>
  baseIntraopUpdatedAtRef: MutableRefObject<string | null>
  enqueueEventSave: <T>(operation: () => Promise<T>) => Promise<T>
  setLog: Dispatch<SetStateAction<LogEvent[]>>
  setTimetable: Dispatch<SetStateAction<TimetableData>>
  setElapsedMs: Dispatch<SetStateAction<number>>
  setSyncState: Dispatch<SetStateAction<SyncState>>
  setLastSavedAt: Dispatch<SetStateAction<string | null>>
  setPendingCount: Dispatch<SetStateAction<number>>
  noteVitalsRef: MutableRefObject<() => void>
}

export function useIntraopEventPersistence({
  caseId,
  entryTs,
  setEntryTs,
  log,
  logRef,
  startRef,
  legacyWebLogNeedsSyncRef,
  baseIntraopUpdatedAtRef,
  enqueueEventSave,
  setLog,
  setTimetable,
  setElapsedMs,
  setSyncState,
  setLastSavedAt,
  setPendingCount,
  noteVitalsRef,
}: UseIntraopEventPersistenceArgs) {
  const [undoEv, setUndoEv] = useState<LogEvent | null>(null)
  // A queue dedicated to the local SecureStore pending-events cache, separate
  // from enqueueEventSave (which serializes network POST/PUT/retry work).
  // v4.1.1 routed the local read-modify-write through the SAME queue as the
  // network calls to fix a lost-update race — but that queue is a strict
  // FIFO, so every local bookkeeping step then had to wait behind whatever
  // network call was currently in flight, including a slow/hung one. That
  // made every action (even a pure local "stop") feel stuck behind
  // whatever request happened to be running. A separate queue keeps local
  // writes serialized against each other without coupling their latency to
  // the network.
  const pendingStoreQueueRef = useRef(createSingleFlightQueue())

  async function save(partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent = false): Promise<LogEvent> {
    const ev: LogEvent = { id: uid(), ts: tsOverride ?? entryTs ?? new Date().toISOString(), syncStatus: "pending", ...partial }
    const newLog = [ev, ...logRef.current]
    logRef.current = newLog
    setLog(newLog)
    setSyncState("saving")
    const pendingCountAfterAdd = await pendingStoreQueueRef.current.enqueue(async () => {
      const pending = await loadPendingIntraopEvents<LogEvent>(caseId)
      await storePendingIntraopEvents(caseId, prependPendingIntraopEvent(pending, ev))
      return pending.length + 1
    })
    setPendingCount(pendingCountAfterAdd)
    if (!startRef.current) {
      startRef.current = new Date(ev.ts)
      setElapsedMs(0)
    }
    setTimetable(eventsToTimetable(newLog, roundDown5Min(startRef.current!), new Date()))
    try {
      await enqueueEventSave(async () => {
        const res = await apiFetch(`/api/cases/${caseId}/events`, {
          method: legacyWebLogNeedsSyncRef.current ? "PUT" : "POST",
          headers: {
            "X-Idempotency-Key": `${caseId}:${ev.id}`,
            "X-Lospor-Source": "mobile",
            ...(legacyWebLogNeedsSyncRef.current && baseIntraopUpdatedAtRef.current
              ? { "x-lospor-intraop-updated-at": baseIntraopUpdatedAtRef.current }
              : {}),
          },
          body: legacyWebLogNeedsSyncRef.current
            ? JSON.stringify(serializeIntraopLogForServer(newLog))
            : JSON.stringify(serializeIntraopEventForServer(ev)),
        })
        if (!res.ok) throw new Error()
        const body = await res.json().catch(() => ({}))
        legacyWebLogNeedsSyncRef.current = false
        baseIntraopUpdatedAtRef.current = body?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
        const remainingCount = await pendingStoreQueueRef.current.enqueue(async () => {
          const remaining = removePendingIntraopEvent(await loadPendingIntraopEvents<LogEvent>(caseId), ev.id)
          await storePendingIntraopEvents(caseId, remaining)
          return remaining.length
        })
        setPendingCount(remainingCount)
        setLog(prev => markIntraopEventSynced(prev, ev.id) as LogEvent[])
      })
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      const stillPendingCount = await pendingStoreQueueRef.current.enqueue(async () => (await loadPendingIntraopEvents<LogEvent>(caseId)).length)
      setSyncState(stillPendingCount > 0 ? "failed" : "saved")
      if (!silent) {
        setUndoEv(serializeIntraopEventForServer(ev) as LogEvent)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        if (ev.type === "vital") noteVitalsRef.current()
      }
    } catch {
      setLog(prev => markIntraopEventFailed(prev, ev.id) as LogEvent[])
      setSyncState("failed")
      if (!silent) setUndoEv({ ...ev, syncStatus: "failed" })
      if (!silent) notify("Saved locally", "Network save failed. The event is still visible and will retry from this screen.")
    }
    setEntryTs(null)
    return ev
  }

  async function syncLog(newLog: LogEvent[]) {
    logRef.current = newLog
    setLog(newLog)
    if (startRef.current) setTimetable(eventsToTimetable(newLog, roundDown5Min(startRef.current), new Date()))
    setSyncState("saving")
    const putFullLog = async (updatedAt: string | null) => {
      const res = await apiFetch(`/api/cases/${caseId}/events`, {
        method: "PUT",
        headers: updatedAt ? { "x-lospor-intraop-updated-at": updatedAt } : undefined,
        body: JSON.stringify(serializeIntraopLogForServer(newLog)),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) {
        const serverUpdatedAt = body?.serverVersion?.updatedAt as string | undefined
        if (serverUpdatedAt) {
          baseIntraopUpdatedAtRef.current = serverUpdatedAt
        }
        return { ok: false as const, conflict: true as const, body }
      }
      if (!res.ok) return { ok: false as const, conflict: false as const, body }
      return { ok: true as const, body }
    }
    try {
      await enqueueEventSave(async () => {
        let result = await putFullLog(baseIntraopUpdatedAtRef.current)
        if (!result.ok && result.conflict && baseIntraopUpdatedAtRef.current) {
          result = await putFullLog(baseIntraopUpdatedAtRef.current)
        }
        if (!result.ok) throw new Error()
        const body = result.body
        legacyWebLogNeedsSyncRef.current = false
        baseIntraopUpdatedAtRef.current = body?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
        await pendingStoreQueueRef.current.enqueue(() => storePendingIntraopEvents(caseId, []))
        setPendingCount(0)
        setLog(prev => stripIntraopLogSyncStatuses(prev) as LogEvent[])
      })
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setSyncState("saved")
    } catch {
      setSyncState("failed")
      notify("Sync error", "Could not save change. Reload to restore.")
    }
  }

  async function retryPendingEvents() {
    const pending = await pendingStoreQueueRef.current.enqueue(() => loadPendingIntraopEvents<LogEvent>(caseId))
    if (pending.length === 0) {
      if (legacyWebLogNeedsSyncRef.current) {
        setSyncState("saving")
        try {
          await enqueueEventSave(async () => {
            const res = await apiFetch(`/api/cases/${caseId}/events`, {
              method: "PUT",
              headers: baseIntraopUpdatedAtRef.current ? { "x-lospor-intraop-updated-at": baseIntraopUpdatedAtRef.current } : undefined,
              body: JSON.stringify(serializeIntraopLogForServer(logRef.current)),
            })
            if (!res.ok) throw new Error()
            const body = await res.json().catch(() => ({}))
            baseIntraopUpdatedAtRef.current = body?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
            legacyWebLogNeedsSyncRef.current = false
            setPendingCount(0)
            setLog(prev => stripIntraopLogSyncStatuses(prev) as LogEvent[])
          })
          setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
          setSyncState("saved")
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
          return
        } catch {
          setSyncState("failed")
          notify("Still offline", "The reconstructed web timeline could not sync.")
          return
        }
      }
      setPendingCount(0)
      setSyncState("saved")
      return
    }

    setSyncState("saving")
    if (legacyWebLogNeedsSyncRef.current) {
      try {
        await enqueueEventSave(async () => {
          const res = await apiFetch(`/api/cases/${caseId}/events`, {
            method: "PUT",
            headers: baseIntraopUpdatedAtRef.current ? { "x-lospor-intraop-updated-at": baseIntraopUpdatedAtRef.current } : undefined,
            body: JSON.stringify(serializeIntraopLogForServer(logRef.current)),
          })
          if (!res.ok) throw new Error()
          const body = await res.json().catch(() => ({}))
          baseIntraopUpdatedAtRef.current = body?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
          legacyWebLogNeedsSyncRef.current = false
          await pendingStoreQueueRef.current.enqueue(() => storePendingIntraopEvents(caseId, []))
          setPendingCount(0)
          setLog(prev => stripIntraopLogSyncStatuses(prev) as LogEvent[])
        })
        setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
        setSyncState("saved")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        return
      } catch {
        setSyncState("failed")
        notify("Still offline", `${pending.length} event${pending.length === 1 ? "" : "s"} could not sync.`)
        return
      }
    }

    const failed: LogEvent[] = []
    for (const ev of [...pending].reverse()) {
      try {
        await enqueueEventSave(async () => {
          const res = await apiFetch(`/api/cases/${caseId}/events`, {
            method: "POST",
            headers: {
              "X-Idempotency-Key": `${caseId}:${ev.id}`,
              "X-Lospor-Source": "mobile",
            },
            body: JSON.stringify(serializeIntraopEventForServer(ev)),
          })
          if (!res.ok) throw new Error()
          const body = await res.json().catch(() => ({}))
          baseIntraopUpdatedAtRef.current = body?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
          setLog(prev => markIntraopEventSynced(prev, ev.id) as LogEvent[])
        })
      } catch {
        failed.push({ ...ev, syncStatus: "failed" })
      }
    }

    await pendingStoreQueueRef.current.enqueue(() => storePendingIntraopEvents(caseId, failed))
    setPendingCount(failed.length)
    if (failed.length === 0) {
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setSyncState("saved")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } else {
      setSyncState("failed")
      notify("Still offline", `${failed.length} event${failed.length === 1 ? "" : "s"} could not sync.`)
    }
  }

  async function removeEvent(ev: LogEvent, sync = true) {
    const next = log.filter(x => x.id !== ev.id)
    const remainingCount = await pendingStoreQueueRef.current.enqueue(async () => {
      const remainingPending = removePendingIntraopEvent(await loadPendingIntraopEvents<LogEvent>(caseId), ev.id)
      await storePendingIntraopEvents(caseId, remainingPending)
      return remainingPending.length
    })
    setPendingCount(remainingCount)
    setLog(next)
    if (startRef.current) setTimetable(eventsToTimetable(next, roundDown5Min(startRef.current)))
    if (sync && !ev.syncStatus) await syncLog(next)
    else setSyncState(remainingCount > 0 ? "failed" : "saved")
  }

  async function undoLastEvent() {
    if (!undoEv) return
    await removeEvent(undoEv)
    setUndoEv(null)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
  }

  return {
    save,
    syncLog,
    retryPendingEvents,
    removeEvent,
    undoLastEvent,
    undoEv,
    setUndoEv,
  }
}
