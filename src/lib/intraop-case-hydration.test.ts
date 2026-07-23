import { describe, expect, it } from "vitest"

import type { CaseDetailDto } from "@lospor/core/case-detail"
import type { EventMutation } from "@lospor/core/sync"

import { buildLoadedIntraopCaseState } from "./intraop-case-hydration"

function caseWithKeyEvents(keyEvents: unknown): CaseDetailDto {
  return {
    id: "case-1",
    caseCode: "DEMO-1",
    notes: null,
    userId: "user-1",
    institutionId: null,
    status: "IN_PROGRESS",
    finalizedAt: null,
    createdAt: "2026-07-24T08:00:00.000Z",
    updatedAt: "2026-07-24T08:00:00.000Z",
    preop: null,
    postop: null,
    institution: null,
    intraop: {
      id: "intraop-1",
      caseId: "case-1",
      startTime: "08:00",
      keyEvents,
      techniques: [],
      updatedAt: "2026-07-24T08:00:00.000Z",
      syncRevision: 1,
    } as CaseDetailDto["intraop"],
  }
}

describe("buildLoadedIntraopCaseState", () => {
  it("hydrates valid legacy rows while dropping malformed snapshot and queued events", () => {
    const data = caseWithKeyEvents({
      drugs: [
        { colIdx: 1, name: "Propofol", dose: 100, unit: "mg" },
        { colIdx: "invalid", name: "Broken", dose: "1", unit: "mg" },
      ],
      log: [{ id: "invalid-log", type: "drug" }],
    })
    const pendingMutations = [{
      kind: "event.update",
      eventId: "invalid-mutation",
      event: { id: "invalid-mutation", type: "drug" },
    }] as unknown as EventMutation[]

    const loaded = buildLoadedIntraopCaseState(data, [], [], [], pendingMutations)

    expect(loaded.rawLog).toHaveLength(1)
    expect(loaded.rawLog[0]).toMatchObject({
      type: "drug",
      name: "Propofol",
      dose: "100",
      unit: "mg",
    })
  })
})
