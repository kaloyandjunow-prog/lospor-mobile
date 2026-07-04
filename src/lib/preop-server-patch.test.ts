import { describe, expect, it } from "vitest"
import { patchPreopServerCase } from "./preop-server-patch"

function response(ok: boolean, status: number, body: unknown) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

describe("patchPreopServerCase", () => {
  it("patches preop with the base updated-at header", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return response(true, 200, { preopUpdatedAt: "new-at" })
    }) as never

    await expect(patchPreopServerCase("case-1", { asaScore: "II" }, "old-at", fetcher)).resolves.toEqual({
      result: "saved",
      updatedAt: "new-at",
    })
    expect(calls[0].url).toBe("/api/cases/case-1")
    expect(calls[0].init.headers).toEqual({ "x-lospor-preop-updated-at": "old-at" })
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ preop: { asaScore: "II" } })
  })

  it("retries once with server version timestamp on conflict", async () => {
    const calls: Array<{ init: RequestInit }> = []
    const fetcher = (async (_url: string, init: RequestInit) => {
      calls.push({ init })
      return calls.length === 1
        ? response(false, 409, { serverVersion: { updatedAt: "server-at" } })
        : response(true, 200, { preopUpdatedAt: "retry-at" })
    }) as never

    await expect(patchPreopServerCase("case-1", { asaScore: "III" }, "old-at", fetcher)).resolves.toEqual({
      result: "saved",
      updatedAt: "retry-at",
    })
    expect(calls[1].init.headers).toEqual({ "x-lospor-preop-updated-at": "server-at" })
  })

  it("reports not found and unauthorized states for route-level handling", async () => {
    const notFound = (async () => response(false, 404, { error: "Missing" })) as never
    const unauthorized = (async () => response(false, 401, { error: "No session" })) as never

    await expect(patchPreopServerCase("case-1", {}, null, notFound)).resolves.toEqual({ result: "not-found" })
    await expect(patchPreopServerCase("case-1", {}, null, unauthorized)).resolves.toEqual({ result: "unauthorized" })
  })

  it("returns retry failure messages", async () => {
    let count = 0
    const retryFailingFetcher = (async (_url: string, _init: RequestInit) => {
      count += 1
      return count === 1
        ? response(false, 409, { serverVersion: { updatedAt: "server-at" }, error: "Conflict" })
        : response(false, 422, { error: "Invalid payload" })
    }) as never

    await expect(patchPreopServerCase("case-1", {}, "old-at", retryFailingFetcher)).resolves.toEqual({
      result: "failed",
      status: 422,
      message: "Invalid payload",
    })
  })
})
