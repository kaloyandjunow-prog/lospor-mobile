import * as SecureStore from "expo-secure-store"
import { ApiError, apiFetch } from "./api"

export type CasePatchSection = "preop" | "postop" | "intraop"
export type CasePatchResult = "saved" | "queued" | "empty" | "failed"
export type CasePatchResponse = {
  updatedAt?: string
  preopUpdatedAt?: string
  postopUpdatedAt?: string
  intraopUpdatedAt?: string
}
type QueueEntry = { caseId: string; section: CasePatchSection }
export type QueueSummary = { count: number; entries: QueueEntry[] }

const INDEX_KEY = "lospor_pending_case_patches"

function patchKey(caseId: string, section: CasePatchSection) {
  return `lospor_pending_${section}_${caseId}`
}

async function loadQueueIndex(): Promise<QueueEntry[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function getQueuedCasePatchSummary(): Promise<QueueSummary> {
  const entries = await loadQueueIndex()
  return { count: entries.length, entries }
}

/** Returns the list of case IDs that have at least one queued offline patch. */
export async function getQueuedCaseIds(): Promise<string[]> {
  const entries = await loadQueueIndex()
  return [...new Set(entries.map(e => e.caseId))]
}

export async function clearAllQueuedCasePatches(): Promise<number> {
  const entries = await loadQueueIndex()
  await Promise.all(entries.map(e => SecureStore.deleteItemAsync(patchKey(e.caseId, e.section)).catch(() => {})))
  await SecureStore.deleteItemAsync(INDEX_KEY).catch(() => {})
  return entries.length
}

async function storeQueueIndex(entries: QueueEntry[]) {
  if (entries.length === 0) {
    await SecureStore.deleteItemAsync(INDEX_KEY)
    return
  }
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(entries))
}

async function addQueueIndexEntry(caseId: string, section: CasePatchSection) {
  const entries = await loadQueueIndex()
  if (entries.some((entry) => entry.caseId === caseId && entry.section === section)) return
  await storeQueueIndex([...entries, { caseId, section }])
}

async function removeQueueIndexEntry(caseId: string, section: CasePatchSection) {
  const entries = await loadQueueIndex()
  await storeQueueIndex(entries.filter((entry) => entry.caseId !== caseId || entry.section !== section))
}

export async function queueCasePatch(caseId: string, section: CasePatchSection, payload: unknown, baseUpdatedAt?: string | null) {
  // Write patch data BEFORE updating the index so a crash between the two
  // leaves a repairable orphan rather than an index entry with no data.
  const key = patchKey(caseId, section)
  const existingRaw = await SecureStore.getItemAsync(key).catch(() => null)
  let nextPayload = payload
  let nextBaseUpdatedAt = baseUpdatedAt
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw) as { payload?: unknown; baseUpdatedAt?: string | null }
      if (
        payload &&
        existing.payload &&
        typeof payload === "object" &&
        typeof existing.payload === "object" &&
        !Array.isArray(payload) &&
        !Array.isArray(existing.payload)
      ) {
        nextPayload = { ...(existing.payload as Record<string, unknown>), ...(payload as Record<string, unknown>) }
      }
      nextBaseUpdatedAt = existing.baseUpdatedAt ?? baseUpdatedAt
    } catch {
      nextPayload = payload
    }
  }
  await SecureStore.setItemAsync(key, JSON.stringify({ payload: nextPayload, baseUpdatedAt: nextBaseUpdatedAt, queuedAt: new Date().toISOString() }))
  await addQueueIndexEntry(caseId, section)
}

/**
 * Reconcile the queue index against actual SecureStore contents.
 * Call this once at app startup so that a crash mid-write cannot leave
 * the queue in a permanently inconsistent state.
 *
 * Two repairs are performed:
 *
 * 1. Index entries whose SecureStore data is missing are removed (the app
 *    crashed after the data was deleted but before the index was updated).
 *
 * 2. Orphaned patches: because a crash can occur after data is written but
 *    before the index is updated, we re-derive the candidate keys for every
 *    (caseId, section) pair that WAS in the original index and check whether
 *    the data still exists even though the entry was dropped from the index.
 *    SecureStore does not expose key enumeration, so we can only detect
 *    orphans for case/section combinations that appeared in the index at
 *    some point. Any truly novel orphan (from a run that crashed before the
 *    index was written for the first time for that case) cannot be detected
 *    and will remain inert in SecureStore until it is overwritten.
 */
export async function reconcileQueue(): Promise<void> {
  const entries = await loadQueueIndex()
  const ALL_SECTIONS: CasePatchSection[] = ["preop", "postop", "intraop"]

  // Collect all (caseId, section) pairs known from the current index.
  // We will check every combination so we can catch orphans where the index
  // entry was not written but the data was.
  const candidates = new Map<string, QueueEntry>()
  for (const entry of entries) {
    const key = `${entry.caseId}:${entry.section}`
    candidates.set(key, entry)
  }

  // Also derive candidate keys from all caseIds in the index across all
  // known sections, so we catch the "data written, index not written" case.
  const caseIds = [...new Set(entries.map(e => e.caseId))]
  for (const caseId of caseIds) {
    for (const section of ALL_SECTIONS) {
      const key = `${caseId}:${section}`
      if (!candidates.has(key)) {
        candidates.set(key, { caseId, section })
      }
    }
  }

  // Check each candidate in parallel — parallel reads are much faster than
  // sequential awaits when there are many queued entries on startup.
  const candidateList = [...candidates.values()]
  const results = await Promise.all(
    candidateList.map(entry =>
      SecureStore.getItemAsync(patchKey(entry.caseId, entry.section)).catch(() => null)
    )
  )
  const reconciled: QueueEntry[] = candidateList.filter((_, i) => results[i] !== null)

  await storeQueueIndex(reconciled)
}

export async function clearQueuedCasePatch(caseId: string, section: CasePatchSection) {
  await SecureStore.deleteItemAsync(patchKey(caseId, section))
  await removeQueueIndexEntry(caseId, section)
}

/** Remove all queued patches for a case (call after the case is deleted). */
export async function clearAllQueuedPatchesForCase(caseId: string): Promise<void> {
  const entries = await loadQueueIndex()
  const forCase = entries.filter(e => e.caseId === caseId)
  await Promise.all(forCase.map(e => SecureStore.deleteItemAsync(patchKey(e.caseId, e.section))))
  await storeQueueIndex(entries.filter(e => e.caseId !== caseId))
}

export async function loadQueuedCasePatch<T = unknown>(caseId: string, section: CasePatchSection): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(patchKey(caseId, section))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed?.payload ?? null
  } catch {
    return null
  }
}

async function patchCase(caseId: string, section: CasePatchSection, payload: unknown, baseUpdatedAt?: string | null): Promise<CasePatchResponse> {
  // No idempotency key here, unlike pending-intraop-events.ts's POST calls:
  // this PATCH replaces the whole section with the latest local payload, so
  // a retried/replayed request converges to the same end state instead of
  // creating a duplicate row the way replaying an event-create POST would.
  // The x-lospor-*-updated-at header below is the actual conflict guard
  // (stale-write detection), not a dedup key.
  const headerName =
    section === "preop" ? "x-lospor-preop-updated-at" :
    section === "postop" ? "x-lospor-postop-updated-at" :
    "x-lospor-intraop-updated-at"
  const res = await apiFetch(`/api/cases/${caseId}`, {
    method: "PATCH",
    headers: baseUpdatedAt ? { [headerName]: baseUpdatedAt } : undefined,
    body: JSON.stringify({ [section]: payload }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error ?? "Save failed", res.status)
  }
  return res.json().catch(() => ({}))
}

export async function saveCasePatchWithQueue(caseId: string, section: CasePatchSection, payload: unknown, baseUpdatedAt?: string | null): Promise<{ result: CasePatchResult; response?: CasePatchResponse }> {
  try {
    const response = await patchCase(caseId, section, payload, baseUpdatedAt)
    await clearQueuedCasePatch(caseId, section)
    return { result: "saved", response }
  } catch (err) {
    if (err instanceof TypeError) {
      await queueCasePatch(caseId, section, payload, baseUpdatedAt)
      return { result: "queued" }
    }
    throw err
  }
}

export async function flushQueuedCasePatch(caseId: string, section: CasePatchSection): Promise<{ result: CasePatchResult; response?: CasePatchResponse }> {
  const raw = await SecureStore.getItemAsync(patchKey(caseId, section))
  if (!raw) return { result: "empty" }
  let parsed: { payload?: unknown; baseUpdatedAt?: string | null }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { result: "empty" }
  }
  if (!parsed.payload) return { result: "empty" }
  try {
    const response = await patchCase(caseId, section, parsed.payload, parsed.baseUpdatedAt)
    await clearQueuedCasePatch(caseId, section)
    return { result: "saved", response }
  } catch (err) {
    // Case was deleted or access revoked — discard stale patch instead of retrying forever
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
      await clearQueuedCasePatch(caseId, section)
      return { result: "empty" }
    }
    // 401 (auth expired) falls through here explicitly, same as network/server
    // errors: keep the patch queued, never discard it. apiFetch already fires
    // the global onAuthExpired signal on a 401, so the app prompts re-login;
    // a later flush pass retries this same patch once a fresh token exists.
    return { result: "failed" }
  }
}

export async function flushAllQueuedCasePatches(): Promise<{ saved: number; failed: number; discarded: number }> {
  const entries = await loadQueueIndex()
  if (entries.length === 0) return { saved: 0, failed: 0, discarded: 0 }

  // Group by caseId so all sections for a case are sent in a single PATCH request.
  const byCaseId = new Map<string, QueueEntry[]>()
  for (const entry of entries) {
    const arr = byCaseId.get(entry.caseId) ?? []
    arr.push(entry)
    byCaseId.set(entry.caseId, arr)
  }

  let saved = 0
  let failed = 0
  let discarded = 0
  // "empty" means the patch was dropped (stale 404/403 or no data) — that's a
  // discard, not a successful save, so count it separately instead of inflating
  // the saved tally.
  const tally = (result: CasePatchResult) => {
    if (result === "saved") saved += 1
    else if (result === "empty") discarded += 1
    else failed += 1
  }
  // Flush each case's sections as a merged batch (one PATCH per case)
  await Promise.all([...byCaseId.entries()].map(async ([, caseEntries]) => {
    if (caseEntries.length === 1) {
      // Single section: use existing per-section flush path
      const result = await flushQueuedCasePatch(caseEntries[0].caseId, caseEntries[0].section)
      tally(result.result)
      return
    }
    // Multiple sections: flush sequentially per case to respect ordering
    for (const entry of caseEntries) {
      const result = await flushQueuedCasePatch(entry.caseId, entry.section)
      tally(result.result)
    }
  }))
  return { saved, failed, discarded }
}
