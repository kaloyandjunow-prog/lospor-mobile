import * as SecureStore from "expo-secure-store"
import { apiFetch, ApiError } from "./api"

// Intraop events are captured optimistically and persisted per-case under
// `lospor_pending_intraop_<caseId>` by the intraop screen. That screen retries
// them while it's open, but if the user backgrounds the app or never reopens the
// case, queued events used to sit unsent. This module keeps a small index of
// which cases have pending events so a global flusher (app foreground / reconnect)
// can replay them too. The server append is idempotent (dedup by event id), so
// replaying an event whose original POST actually succeeded is a safe no-op.

const INDEX_KEY = "lospor_pending_intraop_index"

function pendingKey(caseId: string) {
  return `lospor_pending_intraop_${caseId}`
}

async function loadIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function storeIndex(ids: string[]) {
  const unique = [...new Set(ids)]
  if (unique.length === 0) {
    await SecureStore.deleteItemAsync(INDEX_KEY)
    return
  }
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(unique))
}

/** Called by the intraop screen whenever it writes/clears a case's pending events. */
export async function markPendingIntraopCase(caseId: string, hasPending: boolean): Promise<void> {
  const ids = await loadIndex()
  const has = ids.includes(caseId)
  if (hasPending && !has) await storeIndex([...ids, caseId])
  else if (!hasPending && has) await storeIndex(ids.filter(id => id !== caseId))
}

async function loadPending(caseId: string): Promise<any[]> {
  const raw = await SecureStore.getItemAsync(pendingKey(caseId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function storePending(caseId: string, events: any[]) {
  if (events.length === 0) {
    await SecureStore.deleteItemAsync(pendingKey(caseId))
    return
  }
  await SecureStore.setItemAsync(pendingKey(caseId), JSON.stringify(events))
}

function eventForServer(ev: any) {
  const { syncStatus, ...clean } = ev
  return clean
}

// A small log of events the server permanently rejected (400/403/404). We drop
// them from the active queue so they aren't retried forever, but record them here
// so clinical data is never *silently* discarded — it can be surfaced/recovered.
const DROPPED_KEY = "lospor_intraop_dropped"

async function recordDroppedEvent(caseId: string, ev: any, status: number): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(DROPPED_KEY)
    const list = raw ? (JSON.parse(raw) as any[]) : []
    list.push({ caseId, event: eventForServer(ev), status, droppedAt: new Date().toISOString() })
    await SecureStore.setItemAsync(DROPPED_KEY, JSON.stringify(list.slice(-200)))
  } catch {
    /* best-effort — never let logging a drop throw */
  }
}

/** Events the server permanently rejected (kept for visibility/recovery). */
export async function getDroppedIntraopEvents(): Promise<any[]> {
  const raw = await SecureStore.getItemAsync(DROPPED_KEY)
  if (!raw) return []
  try { const l = JSON.parse(raw); return Array.isArray(l) ? l : [] } catch { return [] }
}

export async function clearAllPendingIntraopEvents(): Promise<number> {
  const ids = await loadIndex()
  await Promise.all(ids.map(id => SecureStore.deleteItemAsync(pendingKey(id)).catch(() => {})))
  await SecureStore.deleteItemAsync(INDEX_KEY).catch(() => {})
  await SecureStore.deleteItemAsync(DROPPED_KEY).catch(() => {})
  return ids.length
}

/**
 * Replay any persisted intraop events that haven't reached the server yet.
 * Safe to call repeatedly (idempotent server-side). Returns counts for diagnostics.
 */
export async function flushPendingIntraopEvents(): Promise<{ saved: number; failed: number }> {
  const ids = await loadIndex()
  if (ids.length === 0) return { saved: 0, failed: 0 }

  let saved = 0
  let failed = 0

  for (const caseId of ids) {
    // Stored newest-first by the intraop screen — replay oldest-first.
    const pending = (await loadPending(caseId)).slice().reverse()
    if (pending.length === 0) {
      await markPendingIntraopCase(caseId, false)
      continue
    }

    const stillPending: any[] = []
    let networkDown = false
    for (const ev of pending) {
      if (networkDown) { stillPending.push(ev); continue }
      try {
        const res = await apiFetch(`/api/cases/${caseId}/events`, {
          method: "POST",
          headers: {
            // Stable idempotency key so a replayed event is stored exactly once.
            "X-Idempotency-Key": `${caseId}:${ev.id}`,
            "X-Lospor-Source": "mobile",
          },
          body: JSON.stringify(eventForServer(ev)),
        })
        if (res.ok) { saved += 1; continue }
        if (res.status === 401) {
          // Auth expired — this is transient. Keep the event (it succeeds after
          // re-login) and stop hitting the server for the rest of this batch so we
          // don't burn through every queued event on the same expired token.
          stillPending.push(ev); failed += 1; networkDown = true; continue
        }
        if (res.status >= 500) {
          // Server error — keep for a later attempt.
          stillPending.push(ev); failed += 1; continue
        }
        // Permanent 4xx (400 invalid/PII, 403 finalised/forbidden, 404 gone) — can
        // never succeed; record it so it isn't silently lost, then drop it.
        await recordDroppedEvent(caseId, ev, res.status)
        failed += 1
      } catch (err) {
        // Network error — stop hitting the network for this case and keep the rest.
        if (err instanceof ApiError && err.code === "NETWORK") networkDown = true
        stillPending.push(ev); failed += 1
        if (!(err instanceof ApiError)) networkDown = true
      }
    }

    // Re-store remaining in newest-first order to match the screen's convention.
    await storePending(caseId, stillPending.slice().reverse())
    await markPendingIntraopCase(caseId, stillPending.length > 0)
  }

  return { saved, failed }
}
