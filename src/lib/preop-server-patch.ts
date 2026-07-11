// Thin adapter over the shared conflict-retry engine in @lospor/core/sync:
// preop section PATCH with the standard one-shot 409 self-heal, mapped to the
// route-level result union the preop screens consume.
import {
  classifyPatchResponse,
  saveWithConflictRetry,
  SECTION_CONFLICT_HEADER,
} from "@lospor/core/sync"

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>

type PatchPreopSaved = {
  result: "saved"
  updatedAt: string | null
}

type PatchPreopNotFound = {
  result: "not-found"
}

type PatchPreopUnauthorized = {
  result: "unauthorized"
}

type PatchPreopFailed = {
  result: "failed"
  message: string
  status: number
}

export type PatchPreopServerCaseResult =
  | PatchPreopSaved
  | PatchPreopNotFound
  | PatchPreopUnauthorized
  | PatchPreopFailed

type PreopPatchBody = { preopUpdatedAt?: string }

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error
  }
  return fallback
}

export async function patchPreopServerCase(
  caseId: string,
  preopPayload: Record<string, unknown>,
  baseUpdatedAt: string | null,
  fetcher: ApiFetch
): Promise<PatchPreopServerCaseResult> {
  const baseRef = { current: baseUpdatedAt }
  const outcome = await saveWithConflictRetry<PreopPatchBody>(
    async (base) => {
      const res = await fetcher(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: base ? { [SECTION_CONFLICT_HEADER.preop]: base } : undefined,
        body: JSON.stringify({ preop: preopPayload }),
      })
      return classifyPatchResponse<PreopPatchBody>(res)
    },
    baseRef,
    (body) => body.preopUpdatedAt,
  )

  if (outcome.ok) {
    // First-attempt success reports exactly what the server echoed (possibly
    // null); after a self-healed retry, fall back to the adopted server
    // timestamp — both match the historical behavior.
    const echoed = typeof outcome.body.preopUpdatedAt === "string" ? outcome.body.preopUpdatedAt : null
    return { result: "saved", updatedAt: echoed ?? (outcome.retried ? baseRef.current : null) }
  }

  if (outcome.conflict) {
    return {
      result: "failed",
      status: 409,
      message: errorMessage(outcome.body, outcome.retried ? "Save failed after retry" : "Save failed"),
    }
  }

  if (outcome.status === 401) return { result: "unauthorized" }
  if (outcome.status === 404 && !outcome.retried) return { result: "not-found" }
  return {
    result: "failed",
    status: outcome.status ?? 0,
    message: errorMessage(outcome.body, outcome.retried ? "Save failed after retry" : "Save failed"),
  }
}
