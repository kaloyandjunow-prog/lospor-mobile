import { describe, expect, it } from "vitest"
import {
  eventsToTimetable, webTimetableToLog, roundDown5Min, eventCol,
  hhmmFromStoredTime, numOrUndefined, hasAnyValue, computeVerticalTimetableWindow,
  loadedTimetableStateFromLog,
  safeTimetableScrollIndex,
  timetableTabInitialScrollTarget,
} from "./intraop-projection"
import type { LogEvent } from "@/lib/intraop-log-event"

const START = new Date("2026-01-01T08:00:00.000Z")
const at = (mins: number) => new Date(START.getTime() + mins * 60_000).toISOString()
const ev = (e: Partial<LogEvent>): LogEvent => e as LogEvent

describe("eventsToTimetable", () => {
  it("places a vital at the right 5-minute column", () => {
    const tt = eventsToTimetable([ev({ type: "vital", ts: at(10), heartRate: 70 })], START)
    expect(tt.vitals[2]).toMatchObject({ heartRate: 70 })
  })

  it("projects a drug at its column", () => {
    const tt = eventsToTimetable([ev({ type: "drug", ts: at(5), name: "Propofol", dose: "100", unit: "mg" })], START)
    expect(tt.drugs[0]).toMatchObject({ colIdx: 1, name: "Propofol", dose: "100", unit: "mg" })
  })

  it("captures an infusion start→stop span at its initial rate, with rate changes", () => {
    const log = [ // newest-first
      ev({ type: "infusion_stop", ts: at(20), infId: "i1" }),
      ev({ type: "infusion_rate", ts: at(10), infId: "i1", rate: "8" }),
      ev({ type: "infusion_start", ts: at(0), infId: "i1", name: "Noradrenaline", rate: "5", unit: "mcg/min", color: "#f00" }),
    ]
    const tt = eventsToTimetable(log, START)
    expect(tt.infusions[0]).toMatchObject({ id: "i1", rate: "5", startCol: 0, endCol: 4 })
    expect(tt.infusions[0].rateChanges?.[0]).toMatchObject({ col: 2, rate: "8" })
  })

  it("extends an open infusion one column past the now-marker", () => {
    const now = new Date(START.getTime() + 30 * 60_000)
    const tt = eventsToTimetable([ev({ type: "infusion_start", ts: at(0), infId: "i1", name: "X", rate: "5", unit: "u", color: "#0" })], START, now)
    expect(tt.infusions[0].endCol).toBe(7) // nowCol 6 + 1
  })
})

describe("webTimetableToLog", () => {
  it("converts vitals/drugs into newest-first log events", () => {
    const log = webTimetableToLog(
      { vitals: [null, { heartRate: 80 }], drugs: [{ colIdx: 0, name: "Fentanyl", dose: "100", unit: "mcg" }] },
      START,
    )
    expect(log.find(e => e.type === "vital")).toMatchObject({ heartRate: 80 })
    expect(log.find(e => e.type === "drug")).toMatchObject({ name: "Fentanyl", dose: "100", unit: "mcg" })
  })
})

describe("projection helpers", () => {
  it("eventCol / roundDown5Min / numOrUndefined / hasAnyValue / hhmmFromStoredTime", () => {
    expect(eventCol(ev({ ts: at(12) }), START)).toBe(2)
    expect(roundDown5Min(new Date("2026-01-01T08:07:30.000Z")).getMinutes() % 5).toBe(0)
    expect(numOrUndefined("3.5")).toBe(3.5)
    expect(numOrUndefined("")).toBeUndefined()
    expect(hasAnyValue({ a: "", b: 1 }, ["a", "b"])).toBe(true)
    expect(hasAnyValue({ a: "" }, ["a"])).toBe(false)
    expect(hhmmFromStoredTime("08:30")).toBe("08:30")
    expect(hhmmFromStoredTime("2026-01-01T08:30:00.000Z")).toBe("08:30")
  })

  it("computes safe timetable scroll targets", () => {
    expect(safeTimetableScrollIndex(5, 20)).toBe(5)
    expect(safeTimetableScrollIndex(30, 20)).toBe(19)

    expect(timetableTabInitialScrollTarget(2, 12, 20)).toBe(5)
    expect(timetableTabInitialScrollTarget(8, 12, 20)).toBe(12)
    expect(timetableTabInitialScrollTarget(30, 40, 20)).toBe(19)
  })
})

describe("computeVerticalTimetableWindow", () => {
  it("groups events by column and projects enough rows for now, events, and running bars", () => {
    const log = [
      ev({ id: "v2", type: "vital", ts: at(10) }),
      ev({ id: "d1", type: "drug", ts: at(5) }),
    ]
    const window = computeVerticalTimetableWindow(
      log,
      {
        vitals: [],
        drugs: [],
        fluids: [{ id: "f1", name: "Ringer", category: "", volume: "500", color: "#0", startCol: 1, endCol: 14 }],
        infusions: [],
        agents: [],
        gasSettings: [],
      },
      START,
      new Date(START.getTime() + 31 * 60_000),
    )

    expect(window.currentCol).toBe(6)
    expect(window.nowSlotPercent).toBe(20)
    expect(window.eventRows[1]).toHaveLength(1)
    expect(window.eventRows[2]).toHaveLength(1)
    expect(window.lastEventCol).toBe(2)
    expect(window.chartRows.at(-1)).toBe(15)
  })

  it("keeps a minimum twelve-row window and clamps now marker percent", () => {
    const early = computeVerticalTimetableWindow([], { vitals: [], drugs: [], fluids: [], infusions: [], agents: [], gasSettings: [] }, START, START)
    expect(early.chartRows).toHaveLength(12)
    expect(early.nowSlotPercent).toBe(3)

    const late = computeVerticalTimetableWindow([], { vitals: [], drugs: [], fluids: [], infusions: [], agents: [], gasSettings: [] }, START, new Date(START.getTime() + 4.95 * 60_000))
    expect(late.nowSlotPercent).toBe(97)
  })
})

describe("loadedTimetableStateFromLog", () => {
  it("returns empty defaults for empty logs", () => {
    expect(loadedTimetableStateFromLog([], START)).toEqual({
      startDate: null,
      elapsedMs: 0,
      timetable: null,
      columnCount: 12,
    })
  })

  it("derives start date, elapsed time, timetable, and column count from loaded log", () => {
    const log = [
      ev({ id: "latest", type: "drug", ts: at(10), name: "Fentanyl", dose: "50", unit: "mcg" }),
      ev({ id: "start", type: "clinical_event", ts: at(0), label: "Start" }),
    ]
    const state = loadedTimetableStateFromLog(log, new Date(START.getTime() + 30 * 60_000))

    expect(state.startDate?.toISOString()).toBe(at(0))
    expect(state.elapsedMs).toBe(30 * 60_000)
    expect(state.columnCount).toBe(18)
    expect(state.timetable?.drugs[0]).toMatchObject({ name: "Fentanyl", colIdx: 2 })
  })
})
