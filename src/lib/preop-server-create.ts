import { buildPreopPayload } from "@/lib/preop-payload"
import type { PreopFormInput } from "@/lib/preop-form-schema"

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>

type PostPreopServerCaseSuccess = {
  ok: true
  id: string
  updatedAt: string | null
}

type PostPreopServerCaseFailure = {
  ok: false
  message: string
  status?: number
  body?: Record<string, unknown>
  error?: unknown
}

export type PostPreopServerCaseResult = PostPreopServerCaseSuccess | PostPreopServerCaseFailure

export async function postPreopServerCase(
  values: PreopFormInput,
  draftId: string,
  fetcher: ApiFetch
): Promise<PostPreopServerCaseResult | null> {
  if (!values || Object.keys(values).length === 0) return null

  try {
    const res = await fetcher("/api/cases", {
      method: "POST",
      headers: { "X-Idempotency-Key": draftId },
      body: JSON.stringify({ preop: buildPreopPayload(values) }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>
      return {
        ok: false,
        status: res.status,
        body,
        message: typeof body.error === "string" ? body.error : `Save failed (HTTP ${res.status})`,
      }
    }

    const json = await res.json()
    const updatedAt = json.preopUpdatedAt ?? json.preop?.updatedAt ?? json.updatedAt ?? null
    return { ok: true, id: json.id, updatedAt }
  } catch (error) {
    return {
      ok: false,
      error,
      message: `Network error: ${error instanceof Error ? error.message : "cannot reach server"}`,
    }
  }
}
