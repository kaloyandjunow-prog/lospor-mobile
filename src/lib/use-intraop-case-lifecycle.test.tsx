import React from "react"
import { act } from "react-test-renderer"
import { beforeEach, describe, expect, it, vi } from "vitest"

const dialogs = vi.hoisted(() => ({
  notify: vi.fn(),
  confirmAction: vi.fn(async () => true),
}))
const readiness = vi.hoisted(() => ({
  value: { valid: true, issues: [], blockers: [] as { code: string }[], warnings: [] as { code: string }[] },
}))

vi.mock("@/lib/notify", () => dialogs)
vi.mock("@/lib/preferences-context", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/preferences-context")>(),
  usePreferences: () => ({ tc: (key: string) => key, language: "en" }),
}))
vi.mock("@/theme/shade", () => ({ useShade: () => (hex: string) => hex }))
vi.mock("@lospor/core/clinical-validation", async importOriginal => ({
  ...await importOriginal<typeof import("@lospor/core/clinical-validation")>(),
  evaluateIntraopReadiness: () => readiness.value,
}))

import { render } from "@/test/render"
import type { LogEvent } from "@/lib/intraop-log-event"
import { useIntraopCaseLifecycle } from "./use-intraop-case-lifecycle"

/**
 * End case on the PWA (10.1.0): it always opens its sheet, because the sheet
 * is where End at lives -- a case charted afterwards usually has nothing
 * running and nothing to answer, and used to end at "now" without asking.
 */
function harness(options: { endedAt?: Date | null } = {}) {
  const setCaseEndTime = vi.fn()
  const save = vi.fn(async () => {})
  const saveTiming = vi.fn(async () => {})
  let lifecycle!: ReturnType<typeof useIntraopCaseLifecycle>
  function Harness() {
    lifecycle = useIntraopCaseLifecycle({
      startRef: { current: new Date("2026-10-29T06:00:00.000Z") },
      setElapsedMs: () => {},
      setCaseInfo: () => {},
      setCaseStartTime: () => {},
      setCaseEndTime,
      setCaseEndNextDay: () => {},
      caseTimezone: "Europe/Sofia",
      save: save as never,
      saveTiming: saveTiming as never,
      patchIntraopSection: vi.fn(async () => {}) as never,
      cancelLabel: "Cancel",
      activeAgents: [],
      activeGas: null as never,
      activeInfusions: [],
      activeFluids: [],
      stopAgent: vi.fn(),
      stopGasSettings: vi.fn(),
      stopInfusion: vi.fn(),
      stopFluidDirect: vi.fn(),
      getReadinessInput: () => ({}),
      timeline: {
        caseId: "case-1",
        log: [],
        logRef: { current: [] as LogEvent[] },
        syncLog: vi.fn(async () => true),
        removeEvent: vi.fn(async () => {}),
        labelOf: () => "",
        endedAtRef: { current: options.endedAt ?? null },
        resyncActiveRef: { current: () => {} },
        vitals: null,
      },
    })
    return null
  }
  render(<Harness />)
  return { get: () => lifecycle, setCaseEndTime, save, saveTiming }
}

describe("End case on the PWA", () => {
  beforeEach(() => {
    dialogs.notify.mockClear()
    dialogs.confirmAction.mockReset().mockResolvedValue(true)
    readiness.value = { valid: true, issues: [], blockers: [], warnings: [] }
  })

  it("opens its sheet with nothing running and nothing to answer, and ends nothing yet", async () => {
    const view = harness()
    await act(async () => { await view.get().openEndCase() })
    expect(view.get().endCaseOpen).toBe(true)
    expect(view.get().endCaseRunningItems).toEqual([])
    expect(dialogs.confirmAction).not.toHaveBeenCalled()
    expect(view.setCaseEndTime).not.toHaveBeenCalled()
    expect(view.saveTiming).not.toHaveBeenCalled()
    expect(view.save).not.toHaveBeenCalled()
  })

  it("asks first about incomplete sections, and opens the sheet only on Continue", async () => {
    readiness.value = { ...readiness.value, warnings: [{ code: "missing_airway" }] }
    dialogs.confirmAction.mockResolvedValueOnce(false)
    const view = harness()
    await act(async () => { await view.get().openEndCase() })
    expect(dialogs.confirmAction).toHaveBeenCalledTimes(1)
    expect(view.get().endCaseOpen).toBe(false)
    await act(async () => { await view.get().openEndCase() })
    expect(view.get().endCaseOpen).toBe(true)
  })

  it("does not open while required information is missing", async () => {
    readiness.value = { ...readiness.value, valid: false, blockers: [{ code: "missing_start_time" }] }
    const view = harness()
    await act(async () => { await view.get().openEndCase() })
    expect(dialogs.notify).toHaveBeenCalledWith("requiredInfoMissing", expect.stringContaining("completeBeforeEnding"))
    expect(view.get().endCaseOpen).toBe(false)
  })
})
