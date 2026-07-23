import * as SecureStore from "expo-secure-store"
import {
  createAutosaveManager,
  eventIdempotencyKey,
  IDEMPOTENCY_HEADER,
  SECTION_CONFLICT_HEADER,
  SECTION_REVISION_HEADER,
  SOURCE_HEADER,
  type EventMutation,
  type KVAdapter,
  type PatchFailure,
  type SectionRevision,
} from "@lospor/core/sync"

import { ApiError, apiFetch } from "./api"

const kv: KVAdapter = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
}

function revisionHeaders(
  section: "preop" | "postop" | "intraop",
  revision: SectionRevision | undefined,
): Record<string, string> | undefined {
  if (typeof revision === "number") return { [SECTION_REVISION_HEADER[section]]: String(revision) }
  if (typeof revision === "string") return { [SECTION_CONFLICT_HEADER[section]]: revision }
  return undefined
}

function classifyPatchError(error: unknown): PatchFailure {
  if (error instanceof TypeError) return { kind: "network" }
  if (error instanceof ApiError) {
    if (error.code === "NETWORK") return { kind: "network" }
    const version = error.serverVersion
    return {
      kind: "http",
      status: error.status,
      serverRevision: typeof version?.revision === "number" ? version.revision : undefined,
      serverUpdatedAt: typeof version?.updatedAt === "string" ? version.updatedAt : undefined,
    }
  }
  return { kind: "other" }
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ApiError && error.code === "NETWORK")
}

async function mutationRequest(operation: EventMutation, revision: SectionRevision) {
  const headers: Record<string, string> = {
    [SOURCE_HEADER]: "mobile",
    "x-lospor-operation-id": operation.operationId,
    ...(revisionHeaders("intraop", revision) ?? {}),
  }
  const response = await apiFetch(
    `/api/cases/${operation.caseId}/events/${encodeURIComponent(operation.eventId)}`,
    {
      method: operation.kind === "event.delete" ? "DELETE" : "PUT",
      headers,
      body: operation.kind === "event.upsert" ? JSON.stringify(operation.event) : undefined,
    },
  )
  const body = await response.json().catch(() => ({})) as {
    intraopRevision?: unknown
    intraopUpdatedAt?: unknown
    serverVersion?: { revision?: unknown; updatedAt?: unknown }
  }
  const acknowledged =
    typeof body.intraopRevision === "number" ? body.intraopRevision :
    typeof body.intraopUpdatedAt === "string" ? body.intraopUpdatedAt :
    undefined
  const serverRevision =
    typeof body.serverVersion?.revision === "number" ? body.serverVersion.revision :
    typeof body.serverVersion?.updatedAt === "string" ? body.serverVersion.updatedAt :
    undefined
  return { ok: response.ok, status: response.status, revision: acknowledged, serverRevision }
}

export const autosaveManager = createAutosaveManager({
  outbox: {
    kv,
    sendPatch: async (caseId, section, payload, revision) => {
      const response = await apiFetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: revisionHeaders(section, revision),
        body: JSON.stringify({ [section]: payload }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        const typed = body as { error?: string; serverVersion?: Record<string, unknown> }
        throw new ApiError(typed.error ?? "Save failed", response.status, undefined, typed.serverVersion)
      }
      return body
    },
    classifyError: classifyPatchError,
  },
  pendingEvents: {
    kv,
    postEvent: async (caseId, event, revision) => {
      const response = await apiFetch(`/api/cases/${caseId}/events`, {
        method: "POST",
        headers: {
          [IDEMPOTENCY_HEADER]: eventIdempotencyKey(caseId, String(event.id)),
          [SOURCE_HEADER]: "mobile",
          ...(revisionHeaders("intraop", revision) ?? {}),
        },
        body: JSON.stringify(event),
      })
      const body = await response.json().catch(() => ({})) as {
        intraopRevision?: unknown
        intraopUpdatedAt?: unknown
        serverVersion?: { revision?: unknown; updatedAt?: unknown }
      }
      return {
        ok: response.ok,
        status: response.status,
        revision:
          typeof body.intraopRevision === "number" ? body.intraopRevision :
          typeof body.intraopUpdatedAt === "string" ? body.intraopUpdatedAt :
          null,
        serverRevision:
          typeof body.serverVersion?.revision === "number" ? body.serverVersion.revision :
          typeof body.serverVersion?.updatedAt === "string" ? body.serverVersion.updatedAt :
          undefined,
      }
    },
    isNetworkError,
  },
  eventMutations: {
    kv,
    send: mutationRequest,
    isNetworkError,
  },
})
