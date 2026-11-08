import TestRenderer, { act } from "react-test-renderer"
import { Text } from "react-native"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ language: "en", theme: "dark", tc: (key: string) => key }) }))
vi.mock("@/components/case-detail/SummaryTimetable", () => ({
  PALETTES: { dark: { card: "#000", grid: "#111", title: "#222", muted: "#333", ink: "#444", sbp: "#f00", faint: "#555" }, light: {} },
}))

import { WrittenEventList } from "./WrittenEventList"

const keyEvents = {
  log: [
    { id: "e1", ts: "2026-11-07T08:05:00.000Z", type: "clinical_event", label: "Induction" },
    { id: "c1", ts: "2026-11-07T08:30:00.000Z", type: "complication", label: "Hypotension", endTs: "2026-11-07T08:42:00.000Z" },
    { id: "e2", ts: "2026-11-07T09:10:00.000Z", type: "clinical_event", label: "ROSC", timeApproximate: true },
    { id: "v", ts: "2026-11-07T08:01:00.000Z", type: "vital", systolic: 120 },
  ],
}

function render(node: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer
  act(() => { tree = TestRenderer.create(node) })
  return tree
}

describe("the written event list on the case summary", () => {
  it("lists events and complications in order, the complication with its end, the approximate time marked", () => {
    const tree = render(<WrittenEventList keyEvents={keyEvents} timeZone="Europe/Sofia" />)
    const texts = tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(""))
    expect(texts).toEqual(expect.arrayContaining(["10:05", "Induction", "10:30–10:42", "≈11:10", "writtenEventsApproximate"]))
    // One complication row (React Native renders each View as a component and a host node).
    const rows = tree.root.findAll(node => node.props.testID === "written-event-complication")
    expect(new Set(rows.map(row => row.props.children))).toHaveProperty("size", 1)
  })

  it("shows nothing for a case without events", () => {
    expect(render(<WrittenEventList keyEvents={{ log: [] }} />).toJSON()).toBeNull()
  })
})
