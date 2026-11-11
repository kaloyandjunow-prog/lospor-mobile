import React from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("expo-haptics", () => ({}))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, t: (key: string) => key, language: "en" }) }))

import type { LogEvent } from "@/lib/intraop-log-event"
import { CaseSaveStateContext, type CaseSaveState } from "@/lib/use-case-save-state"
import { render } from "@/test/render"
import { TimetableRow, isRowEntry, rowEntryColor } from "./TimetableRow"

// Found 2026-11-11: an opened five-minute row listed four drugs and events at most, so a complication, a shock, an
// infusion's start, a fluid or a position change charted in it was nowhere to be seen.

const start = new Date("2026-11-11T10:00:00.000Z")
const at = (minutes: number, seconds = 0) => new Date(start.getTime() + minutes * 60_000 + seconds * 1000).toISOString()
const saved: CaseSaveState = { queuedEventIds: [], sendingEventId: null, refused: [], queuedSections: [], dismissRefused: () => {} }

const row = (rowEvents: LogEvent[], isExpanded = true) => {
  const noop = () => {}
  return render(
    <CaseSaveStateContext.Provider value={saved}>
      <TimetableRow col={2} chartStart={start} rowHeight={60} isNow={false} isQuarter={false} isExpanded={isExpanded} nowSlotPercent={0}
        rowEvents={rowEvents} running={[]}
        summary={{ criticalParts: [], normalParts: [], eventParts: [], drugParts: [], hasCritical: false, hasUnsynced: false } as never}
        labelOf={ev => `${ev.type}:${ev.label ?? ev.name ?? ""}`} activeInfusions={[]} activeFluids={[]} activeAgents={[]} activeGas={null as never}
        onExpand={noop} onCollapse={noop} onManageInfusion={noop} onEndFluid={noop} onEditGas={noop} onStopAgent={noop} onQuickAdd={noop} />
    </CaseSaveStateContext.Provider>,
  )
}
const entries = (tree: ReturnType<typeof render>) =>
  tree.root.findAll(node => typeof node.type === "string" && String(node.props?.testID ?? "").startsWith("timetable-row-entry-")).map(node => String(node.props.testID).replace("timetable-row-entry-", ""))

describe("the opened five-minute row lists everything charted in it", () => {
  const log = [
    { id: "d1", ts: at(10, 5), type: "drug", name: "Propofol" },
    { id: "c1", ts: at(10, 20), type: "complication", label: "Hypotension" },
    { id: "s1", ts: at(10, 40), type: "defibrillation", label: "Defibrillation" },
    { id: "i1", ts: at(11, 0), type: "infusion_start", name: "Noradrenaline" },
    { id: "f1", ts: at(11, 10), type: "fluid_start", name: "Ringer" },
    { id: "p1", ts: at(12, 0), type: "position_change", label: "Supine" },
    { id: "v1", ts: at(12, 30), type: "vital" },
    { id: "e1", ts: at(13, 0), type: "clinical_event", label: "Incision" },
    { id: "e2", ts: at(13, 10), type: "clinical_event", label: "Intubated" },
    { id: "e3", ts: at(13, 20), type: "clinical_event", label: "Extubated" },
  ] as unknown as LogEvent[]

  it("shows a complication, a shock, infusions, fluids, positions and vitals, not only the first four drugs and events", () => {
    expect(entries(row(log))).toEqual(["drug", "complication", "defibrillation", "infusion_start", "fluid_start", "position_change", "vital", "clinical_event", "clinical_event", "clinical_event"])
  })

  it("does not list an answer to a question: those are never drawn", () => {
    const withAnswer = [...log, { id: "a1", ts: at(13, 30), type: "prompt_answer", answer: "done" } as unknown as LogEvent]
    expect(entries(row(withAnswer))).not.toContain("prompt_answer")
    expect(isRowEntry({ id: "a1", ts: at(13), type: "prompt_answer" } as unknown as LogEvent)).toBe(false)
  })

  it("lists nothing when the row is closed, and no section for an empty row", () => {
    expect(entries(row(log, false))).toEqual([])
    expect(row([]).root.findAll(node => typeof node.type === "string" && node.props?.testID === "timetable-row-entries")).toHaveLength(0)
  })

  it("colours a complication and a shock red, and keeps the colour an entry carries", () => {
    expect(rowEntryColor({ id: "c", ts: at(1), type: "complication" } as unknown as LogEvent)).toBe("#ef4444")
    expect(rowEntryColor({ id: "x", ts: at(1), type: "defibrillation" } as unknown as LogEvent)).toBe("#ef4444")
    expect(rowEntryColor({ id: "e", ts: at(1), type: "clinical_event", color: "#123456" } as unknown as LogEvent)).toBe("#123456")
  })
})
