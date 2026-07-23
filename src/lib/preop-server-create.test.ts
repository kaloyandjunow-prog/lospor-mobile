import { describe, expect, it } from "vitest"
import { postPreopServerCase } from "./preop-server-create"

function response(ok: boolean, status: number, body: unknown) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

describe("postPreopServerCase", () => {
  it("posts canonical preop payload with the draft idempotency key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return response(true, 200, { id: "case-1", preopUpdatedAt: "2026-07-02T10:00:00Z" })
    }) as never

    const result = await postPreopServerCase({
      ageYears: 40,
      sex: "FEMALE",
      heightCm: 170,
      weightKg: 70,
      asaScore: "II",
      diagnoses: [{ label: "Appendicitis" }],
      procedures: [{ label: "Appendectomy" }],
    }, "draft-1", fetcher)

    expect(result).toEqual({ ok: true, id: "case-1", updatedAt: "2026-07-02T10:00:00Z", revision: null })
    expect(calls[0].url).toBe("/api/cases")
    expect(calls[0].init.headers).toEqual({ "X-Idempotency-Key": "draft-1" })
    expect(JSON.parse(calls[0].init.body as string).preop.plannedProcedure).toBe("Appendectomy")
  })

  it("returns the server error message when creation fails", async () => {
    const fetcher = (async () => response(false, 500, { error: "Internal server error" })) as never

    await expect(postPreopServerCase({
      ageYears: 40,
      sex: "MALE",
      heightCm: 170,
      weightKg: 70,
      asaScore: "I",
    }, "draft-1", fetcher)).resolves.toMatchObject({
      ok: false,
      status: 500,
      message: "Internal server error",
    })
  })

  it("returns a network error message when fetch throws", async () => {
    const fetcher = (async () => {
      throw new Error("offline")
    }) as never

    await expect(postPreopServerCase({
      ageYears: 40,
      sex: "MALE",
      heightCm: 170,
      weightKg: 70,
      asaScore: "I",
    }, "draft-1", fetcher)).resolves.toMatchObject({
      ok: false,
      message: "Network error: offline",
    })
  })
})
