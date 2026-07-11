// Thin adapter over the shared pending-event journal in @lospor/core/sync.
// Storage: expo-secure-store. Transport: idempotent POST to the events
// endpoint. Historical function names and storage keys are preserved so
// callers and devices with queued events are unaffected.
//
// Intraop events are captured optimistically by the intraop screen; the
// server append is idempotent (dedup by event id), so replaying an event
// whose original POST actually succeeded is a safe no-op. Permanently
// rejected events land in a dropped-log for visibility instead of being
// silently discarded.
import * as SecureStore from "expo-secure-store"
import { apiFetch, ApiError } from "./api"
import { enqueueIntraopCaseWrite } from "@/lib/intraop-write-queue"
import {
  createPendingEventStore,
  eventIdempotencyKey,
  IDEMPOTENCY_HEADER,
  SOURCE_HEADER,
  type DroppedEvent,
  type KVAdapter,
  type PendingEvent,
} from "@lospor/core/sync"

// Pure list/serialization helpers — shared implementation, historical names.
export {
  mergeLogWithPendingEvents as mergeLogWithPendingIntraopEvents,
  markEventFailed as markIntraopEventFailed,
  markEventSynced as markIntraopEventSynced,
  prependPendingEvent as prependPendingIntraopEvent,
  removePendingEvent as removePendingIntraopEvent,
  serializeEventForServer as serializeIntraopEventForServer,
  serializeLogForServer as serializeIntraopLogForServer,
  stripEventSyncStatus as stripIntraopEventSyncStatus,
  stripLogSyncStatuses as stripIntraopLogSyncStatuses,
} from "@lospor/core/sync"

type PendingIntraopEvent = PendingEvent

const kv: KVAdapter = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
}

const store = createPendingEventStore({
  kv,
  postEvent: async (caseId, event) => {
    const res = await apiFetch(`/api/cases/${caseId}/events`, {
      method: "POST",
      headers: {
        // Stable idempotency key so a replayed event is stored exactly once.
        [IDEMPOTENCY_HEADER]: eventIdempotencyKey(caseId, String(event.id)),
        [SOURCE_HEADER]: "mobile",
      },
      body: JSON.stringify(event),
    })
    return { ok: res.ok, status: res.status }
  },
  // ApiError code NETWORK, or any non-ApiError throw, means "stop hitting the
  // network for this batch" — identical to the historical policy.
  isNetworkError: (err) => (err instanceof ApiError && err.code === "NETWORK") || !(err instanceof ApiError),
  orderWrite: (caseId, run) => enqueueIntraopCaseWrite(caseId, run),
})

/** Called by the intraop screen whenever it writes/clears a case's pending events. */
export function markPendingIntraopCase(caseId: string, hasPending: boolean): Promise<void> {
  return store.markPendingCase(caseId, hasPending)
}

export function loadPendingIntraopEvents<T extends PendingIntraopEvent = PendingIntraopEvent>(
  caseId: string,
): Promise<T[]> {
  return store.loadPending<T>(caseId)
}

export function storePendingIntraopEvents<T extends PendingIntraopEvent>(
  caseId: string,
  events: T[],
): Promise<void> {
  return store.storePending(caseId, events)
}

/** Events the server permanently rejected (kept for visibility/recovery). */
export function getDroppedIntraopEvents(): Promise<DroppedEvent[]> {
  return store.droppedEvents()
}

export function clearAllPendingIntraopEvents(): Promise<number> {
  return store.clearAll()
}

/**
 * Replay any persisted intraop events that haven't reached the server yet.
 * Safe to call repeatedly (idempotent server-side). Returns counts for diagnostics.
 */
export function flushPendingIntraopEvents(): Promise<{ saved: number; failed: number }> {
  return store.flushAll()
}
