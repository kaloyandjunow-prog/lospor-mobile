// Thin adapter over the shared offline outbox in @lospor/core/sync.
// Storage: expo-secure-store. Transport: apiFetch PATCH with per-section
// conflict headers. Historical function names and storage keys are preserved
// so callers and devices with queued data are unaffected.
import * as SecureStore from "expo-secure-store"
import { ApiError, apiFetch } from "./api"
import { enqueueIntraopCaseWrite } from "@/lib/intraop-write-queue"
import {
  createCaseOutbox,
  SECTION_CONFLICT_HEADER,
  type BaseUpdatedAtInput,
  type CasePatchResponse,
  type CasePatchResult,
  type CaseSection,
  type KVAdapter,
  type OutboxSummary,
  type PatchFailure,
} from "@lospor/core/sync"

export type CasePatchSection = CaseSection
export type { CasePatchResult, CasePatchResponse }
export type QueueSummary = OutboxSummary

const kv: KVAdapter = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
}

async function patchCase(
  caseId: string,
  section: CaseSection,
  payload: unknown,
  baseUpdatedAt?: string | null,
): Promise<CasePatchResponse> {
  // No idempotency key here, unlike the event POSTs: this PATCH replaces the
  // whole section with the latest local payload, so a retried/replayed
  // request converges to the same end state. The conflict header below is the
  // stale-write guard, not a dedup key.
  const res = await apiFetch(`/api/cases/${caseId}`, {
    method: "PATCH",
    headers: baseUpdatedAt ? { [SECTION_CONFLICT_HEADER[section]]: baseUpdatedAt } : undefined,
    body: JSON.stringify({ [section]: payload }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error ?? "Save failed", res.status, undefined, body.serverVersion)
  }
  return res.json().catch(() => ({}))
}

function classifyError(err: unknown): PatchFailure {
  // Raw fetch throws TypeError offline; apiJson-level helpers throw
  // ApiError(code "NETWORK"). Both mean "no connectivity — queue it".
  if (err instanceof TypeError) return { kind: "network" }
  if (err instanceof ApiError) {
    return err.code === "NETWORK" ? { kind: "network" } : { kind: "http", status: err.status }
  }
  return { kind: "other" }
}

const outbox = createCaseOutbox({
  kv,
  sendPatch: patchCase,
  classifyError,
  // Intraop patches share the per-case write queue with event saves so a
  // section patch can never interleave with an in-flight event write.
  orderWrite: (caseId, section, run) =>
    section === "intraop" ? enqueueIntraopCaseWrite(caseId, run) : run(),
})

export function getQueuedCasePatchSummary(): Promise<QueueSummary> {
  return outbox.summary()
}

/** Returns the list of case IDs that have at least one queued offline patch. */
export function getQueuedCaseIds(): Promise<string[]> {
  return outbox.queuedCaseIds()
}

export function clearAllQueuedCasePatches(): Promise<number> {
  return outbox.clearAll()
}

export function queueCasePatch(
  caseId: string,
  section: CasePatchSection,
  payload: unknown,
  baseUpdatedAt?: string | null,
): Promise<void> {
  return outbox.queue(caseId, section, payload, baseUpdatedAt)
}

/**
 * Reconcile the queue index against actual SecureStore contents. Call once at
 * app startup so a crash mid-write cannot leave the queue inconsistent.
 */
export function reconcileQueue(): Promise<void> {
  return outbox.reconcile()
}

export function clearQueuedCasePatch(caseId: string, section: CasePatchSection): Promise<void> {
  return outbox.clearOne(caseId, section)
}

/** Remove all queued patches for a case (call after the case is deleted). */
export function clearAllQueuedPatchesForCase(caseId: string): Promise<void> {
  return outbox.clearAllForCase(caseId)
}

export function loadQueuedCasePatch<T = unknown>(caseId: string, section: CasePatchSection): Promise<T | null> {
  return outbox.load<T>(caseId, section)
}

export function saveCasePatchWithQueue(
  caseId: string,
  section: CasePatchSection,
  payload: unknown,
  // A thunk base is resolved inside the write queue right before the request
  // goes out — rapid successive saves then carry the freshest timestamp.
  baseUpdatedAt?: BaseUpdatedAtInput,
): Promise<{ result: CasePatchResult; response?: CasePatchResponse }> {
  return outbox.save(caseId, section, payload, baseUpdatedAt)
}

export function flushQueuedCasePatch(
  caseId: string,
  section: CasePatchSection,
): Promise<{ result: CasePatchResult; response?: CasePatchResponse }> {
  return outbox.flushOne(caseId, section)
}

export function flushAllQueuedCasePatches(): Promise<{ saved: number; failed: number; discarded: number }> {
  return outbox.flushAll()
}
