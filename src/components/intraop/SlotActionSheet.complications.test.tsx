import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

const prefs = vi.hoisted(() => ({ language: "en" }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, language: prefs.language }) }))
vi.mock("@/theme/shade", () => ({ useShade: () => (hex: string) => hex }))
vi.mock("./Sheet", () => ({ Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("./FeedbackPressable", () => ({ FeedbackPressable: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

// The quick complications as the option library serves them, codes included.
const QUICK = [{ cat: "Complications", color: "#ef4444", isComplication: true, events: [
  { code: "COMPLICATIONS_HYPOTENSION", label: "Hypotension", labelBg: "Хипотония", color: "#ef4444" },
  { code: "COMPLICATIONS_DRUG_ERROR", label: "Drug error", labelBg: "Медикаментозна грешка", color: "#ef4444" },
  { code: "COMPLICATIONS_LAST", label: "LAST", labelBg: "Системна токсичност на локалните анестетици (LAST)", color: "#ef4444" },
] }]
import { render } from "@/test/render"
import { SlotActionSheet } from "./SlotActionSheet"

/**
 * The slot sheet's complications (10.1.0): named as the complications list
 * names them, saved under the catalogue's name, and "Show all" adds the rest
 * under the catalogue's headings rather than as one long run.
 */
function sheet(expanded: boolean, search = "") {
  const onSelectEvent = vi.fn()
  const tree = render(
    <SlotActionSheet
      visible title="12:45" eventSearch={search} complicationExpanded={expanded}
      eventCategories={QUICK}
      isGACase={false} activeAgents={[]} activeGas={null as never}
      onClose={() => {}} onEventSearchChange={() => {}} onToggleComplications={() => {}}
      onSelectEvent={onSelectEvent} onBrowseDrugs={() => {}}
      onStopAgent={() => {}} onOpenAgent={() => {}} onStopGas={() => {}} onOpenGas={() => {}}
    />,
  )
  const texts = () => tree.root.findAll(node => typeof node.type === "string" && typeof node.props.children === "string").map(node => node.props.children as string)
  const press = (text: string) => {
    const label = tree.root.findAll(node => typeof node.type === "string" && node.props.children === text)[0]!
    let node = label.parent
    while (node && typeof node.props.onPress !== "function") node = node.parent
    act(() => { node!.props.onPress() })
  }
  return { texts, press, onSelectEvent }
}

describe("complications in the slot sheet", () => {
  it("are named as the complications list names them", () => {
    const { texts } = sheet(false)
    expect(texts()).toContain("Medication error")
    expect(texts()).toContain("Local anaesthetic systemic toxicity (LAST)")
    expect(texts()).not.toContain("Drug error")
  })

  it("save a short quick button under the catalogue's name", () => {
    const { press, onSelectEvent } = sheet(false)
    press("Local anaesthetic systemic toxicity (LAST)")
    expect(onSelectEvent).toHaveBeenCalledWith(expect.objectContaining({ label: "Local anaesthetic systemic toxicity (LAST)" }), true)
  })

  it("show the rest under the catalogue's headings after Show all, each once", () => {
    const collapsed = sheet(false).texts()
    expect(collapsed).not.toContain("Ventricular fibrillation")
    const all = sheet(true).texts()
    for (const heading of ["Cardiovascular", "Respiratory", "Drug / Pharmacological", "Surgical"]) expect(all).toContain(heading)
    expect(all.indexOf("Cardiovascular")).toBeLessThan(all.indexOf("Ventricular fibrillation"))
    expect(all.filter(text => text === "Local anaesthetic systemic toxicity (LAST)")).toHaveLength(1)
    expect(all.filter(text => text === "Medication error")).toHaveLength(1)
  })

  it("search the headed groups too, by the reader's name", () => {
    const { texts } = sheet(true, "ventricular")
    expect(texts()).toContain("Ventricular fibrillation")
    expect(texts()).not.toContain("Hypotension")
  })

  it("read in Bulgarian, headings included", () => {
    prefs.language = "bg"
    try {
      const all = sheet(true).texts()
      expect(all).toContain("Лекарствена грешка")
      expect(all.some(text => text.startsWith("Медикаментозни"))).toBe(true)
    } finally {
      prefs.language = "en"
    }
  })
})
