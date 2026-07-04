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

function preopUpdatedAt(body: Record<string, unknown>): string | null {
  return typeof body.preopUpdatedAt === "string" ? body.preopUpdatedAt : null
}

function serverVersionUpdatedAt(body: Record<string, unknown>): string | null {
  const serverVersion = body.serverVersion
  if (!serverVersion || typeof serverVersion !== "object") return null
  const updatedAt = (serverVersion as { updatedAt?: unknown }).updatedAt
  return typeof updatedAt === "string" ? updatedAt : null
}

function errorMessage(body: Record<string, unknown>, fallback: string): string {
  return typeof body.error === "string" ? body.error : fallback
}

export async function patchPreopServerCase(
  caseId: string,
  preopPayload: Record<string, unknown>,
  baseUpdatedAt: string | null,
  fetcher: ApiFetch
): Promise<PatchPreopServerCaseResult> {
  const res = await fetcher(`/api/cases/${caseId}`, {
    method: "PATCH",
    headers: baseUpdatedAt ? { "x-lospor-preop-updated-at": baseUpdatedAt } : undefined,
    body: JSON.stringify({ preop: preopPayload }),
  })

  if (res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    return { result: "saved", updatedAt: preopUpdatedAt(body) }
  }

  const body = await res.json().catch(() => ({})) as Record<string, unknown>
  if (res.status === 404) return { result: "not-found" }
  if (res.status === 401) return { result: "unauthorized" }

  if (res.status === 409) {
    const serverAt = serverVersionUpdatedAt(body)
    if (serverAt) {
      const retry = await fetcher(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "x-lospor-preop-updated-at": serverAt },
        body: JSON.stringify({ preop: preopPayload }),
      })

      if (retry.ok) {
        const retryBody = await retry.json().catch(() => ({})) as Record<string, unknown>
        return { result: "saved", updatedAt: preopUpdatedAt(retryBody) ?? serverAt }
      }
      if (retry.status === 401) return { result: "unauthorized" }
      const retryBody = await retry.json().catch(() => ({})) as Record<string, unknown>
      return {
        result: "failed",
        status: retry.status,
        message: errorMessage(retryBody, "Save failed after retry"),
      }
    }
  }

  return {
    result: "failed",
    status: res.status,
    message: errorMessage(body, "Save failed"),
  }
}
