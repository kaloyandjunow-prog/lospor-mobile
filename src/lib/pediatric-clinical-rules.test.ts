import { describe, expect, it, vi } from "vitest"
import {
  clinicalRulesStateForMode,
  createPediatricClinicalRulesRepository,
} from "./pediatric-clinical-rules"

const response = {
  preset: { id: "preset-1", name: "Institution standard" },
  productionReady: false,
  effectiveRules: [],
  doseProfiles: [],
}

function storage(initial?: string) {
  let value = initial ?? null
  return {
    get: vi.fn(async () => value),
    set: vi.fn(async (_key: string, next: string) => {
      value = next
    }),
    delete: vi.fn(async () => {
      value = null
    }),
  }
}

describe("pediatric clinical-rules repository", () => {
  it("stores and returns a server snapshot", async () => {
    const adapter = storage()
    const repository = createPediatricClinicalRulesRepository({
      fetchRules: vi.fn(async () => response),
      storage: adapter,
    })

    const result = await repository.load()

    expect(result.source).toBe("server")
    expect(result.preset?.id).toBe("preset-1")
    expect(adapter.set).toHaveBeenCalledOnce()
  })

  it("uses the last approved snapshot when the server is unavailable", async () => {
    const adapter = storage(JSON.stringify({
      cachedAt: "2026-07-30T10:00:00.000Z",
      response,
    }))
    const repository = createPediatricClinicalRulesRepository({
      fetchRules: vi.fn(async () => {
        throw new Error("offline")
      }),
      storage: adapter,
    })

    const result = await repository.load()

    expect(result.source).toBe("cache")
    expect(result.cachedAt).toBe("2026-07-30T10:00:00.000Z")
  })

  it("does not invent rules when neither server nor cache is available", async () => {
    const repository = createPediatricClinicalRulesRepository({
      fetchRules: vi.fn(async () => {
        throw new Error("offline")
      }),
      storage: storage(),
    })

    await expect(repository.load()).rejects.toThrow("offline")
  })
})

describe("clinical-rules hook mode boundary", () => {
  it("cannot expose a previously loaded mode while the requested mode changes", () => {
    const result = clinicalRulesStateForMode({
      requestedMode: "PEDIATRIC",
      loadedMode: "ADULT",
      enabled: true,
      snapshot: {
        ...response,
        mode: "ADULT",
        source: "server",
        cachedAt: "2026-08-23T00:00:00.000Z",
      },
      loading: false,
      error: null,
      prospectiveGuidanceEnabled: true,
      baselineFailure: "NONE",
    })

    expect(result.snapshot).toBeNull()
    expect(result.prospectiveGuidanceEnabled).toBe(false)
    expect(result.baselineFailure).toBe("MISSING")
    expect(result.loading).toBe(true)
  })
})
