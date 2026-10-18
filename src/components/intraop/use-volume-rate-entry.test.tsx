import React, { useState } from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("expo-haptics", () => ({}))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key === "volumeOnPump" ? "on the pump" : key, t: (key: string) => key, language: "en" }),
}))

import { pediatricInfusionProfilesFromRules } from "@lospor/core/clinical-rules"
import { createPediatricInfusionProfileSeeds } from "@lospor/core"
import type { ActiveInfusion } from "@/lib/intraop-log-event"
import { render } from "@/test/render"
import { DoseSelector } from "./DoseSelector"
import { InfusionActionSheet } from "./InfusionActionSheet"

// A child's epidural is set in mL/kg/hr; the limit is a dose, so it follows
// the strength. The pump rate can be typed instead (2026-10-18).
const profiles = pediatricInfusionProfilesFromRules(createPediatricInfusionProfileSeeds().map((seed, index) => ({
  ruleKey: `platform.${index}`,
  ruleVersion: "1",
  payload: seed.payload,
  sourceIds: [],
  sourceRefs: [],
  origin: "PLATFORM" as const,
  presetId: "lospor-pediatrics-v3",
  scope: "PLATFORM" as const,
})) as never)

const epidural = { infId: "epi", name: "Ropivacaine", rate: "0.1", unit: "mL/kg/hr", route: "EPIDURAL", concentration: "0.2%", color: "#0ea5e9" } as ActiveInfusion

function Sheet({ onRate }: { onRate: (rate: string) => void }) {
  const [rate, setRate] = useState("0.1")
  return (
    <InfusionActionSheet
      visible onClose={() => {}} target={epidural} ratePresets={{}} newRate={rate}
      setNewRate={value => { setRate(value); onRate(value) }}
      onChangeRate={() => {}} onStop={() => {}}
      pediatricMode pediatricInfusionProfiles={profiles}
      patientAge={{ value: 2000, unit: "DAYS" }} patientWeightKg={12}
    />
  )
}

describe("a child's epidural infusion", () => {
  it("limits the volume by dose at the strength running, and reads out the pump rate", () => {
    const tree = render(<Sheet onRate={() => {}} />)
    const selector = tree.root.findByType(DoseSelector)
    // From 1 year 0.4 mg/kg/hr: 0.2 mL/kg/hr of 0.2%.
    expect(selector.props).toMatchObject({ max: 0.2, unitSuffix: "mL/kg/hr" })
    expect(selector.props.extraHint).toBe("1.2 mL/hr on the pump · 0.2 mg/kg/hr")
    expect(selector.props.units).toEqual(["mL/kg/hr", "mL/hr"])
  })

  it("takes the pump rate and records it as mL/kg/hr", () => {
    const onRate = vi.fn()
    const tree = render(<Sheet onRate={onRate} />)
    act(() => { tree.root.findByType(DoseSelector).props.onUnitChange("mL/hr") })
    const pump = tree.root.findByType(DoseSelector)
    expect(pump.props).toMatchObject({ unitSuffix: "mL/hr", max: 2.4, value: "1.2" })
    act(() => { pump.props.onValueChange("2.5") })
    expect(onRate).toHaveBeenLastCalledWith("0.208")
    expect(tree.root.findByType(DoseSelector).props.extraHint).toBe("0.208 mL/kg/hr · 0.416 mg/kg/hr")
  })
})
