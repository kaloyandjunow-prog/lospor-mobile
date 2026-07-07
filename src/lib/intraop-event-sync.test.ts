import { beforeEach, describe, expect, it, vi } from "vitest"
import { apiFetch } from "@/lib/api"
import { putFullIntraopLogWithConflictRetry } from "@/lib/intraop-event-sync"
import type { LogEvent } from "@/lib/intraop-log-event"

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}))

const apiFetchMock = vi.mocked(apiFetch)

function response(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response
}

const log: LogEvent[] = [
  { id: "new", ts: "2026-07-06T08:05:00.000Z", type: "drug", name: "Propofol" },
  { id: "old", ts: "2026-07-06T08:00:00.000Z", type: "vital", heartRate: 70 },
]

describe("putFullIntraopLogWithConflictRetry", () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  it("retries once with the server timestamp after a 409", async () => {
    apiFetchMock
      .mockResolvedValueOnce(response(409, { serverVersion: { updatedAt: "server-1" } }))
      .mockResolvedValueOnce(response(200, { intraopUpdatedAt: "server-2" }))
    const baseRef = { current: "client-1" }

    await expect(putFullIntraopLogWithConflictRetry("case-1", log, baseRef)).resolves.toEqual({
      intraopUpdatedAt: "server-2",
    })

    expect(apiFetchMock).toHaveBeenCalledTimes(2)
    expect(apiFetchMock.mock.calls[0][1]?.headers).toEqual({ "x-lospor-intraop-updated-at": "client-1" })
    expect(apiFetchMock.mock.calls[1][1]?.headers).toEqual({ "x-lospor-intraop-updated-at": "server-1" })
    expect(baseRef.current).toBe("server-2")
  })

  it("stops after the retry if the server still reports a conflict", async () => {
    apiFetchMock
      .mockResolvedValueOnce(response(409, { serverVersion: { updatedAt: "server-1" } }))
      .mockResolvedValueOnce(response(409, { serverVersion: { updatedAt: "server-2" } }))
    const baseRef = { current: "client-1" }

    await expect(putFullIntraopLogWithConflictRetry("case-1", log, baseRef)).rejects.toThrow("INTRAOP_FULL_LOG_SAVE_FAILED")

    expect(apiFetchMock).toHaveBeenCalledTimes(2)
    expect(baseRef.current).toBe("server-2")
  })
})
