import React, { useState } from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("expo-haptics", () => ({}))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    tc: (key: string) => ({ volumeOnPump: "on the pump", infusionSyringe: "Syringe" } as Record<string, string>)[key] ?? key,
    t: (key: string) => key,
    language: "en",
    shade: (value: string) => value,
  }),
}))

import { pediatricInfusionProfilesFromRules } from "@lospor/core/clinical-rules"
import { createPediatricInfusionProfileSeeds } from "@lospor/core"
import type { InfusionRecord } from "@lospor/core/infusion-entry"
import type { ActiveInfusion } from "@/lib/intraop-log-event"
import { render } from "@/test/render"
import { DoseSelector } from "./DoseSelector"
import { InfusionActionSheet } from "./InfusionActionSheet"

// The rate entry of a running infusion (2026-10-18): any of its units or the
// pump rate, a syringe, the other rate read out, and both rates recorded.

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

type SheetProps = Partial<React.ComponentProps<typeof InfusionActionSheet>> & { target: ActiveInfusion; startRate: string }

function Sheet({ onRate, onChange, startRate, ...props }: SheetProps & { onRate?: (rate: string) => void; onChange?: (record?: InfusionRecord) => void }) {
  const [rate, setRate] = useState(startRate)
  const [concentration, setConcentration] = useState<string | undefined>(undefined)
  return (
    <InfusionActionSheet
      visible onClose={() => {}} ratePresets={{}} newRate={rate}
      setNewRate={value => { setRate(value); onRate?.(value) }}
      newConcentration={concentration} setNewConcentration={setConcentration}
      onChangeRate={(_target, _rate, _concentration, record) => onChange?.(record)} onStop={() => {}}
      {...props}
    />
  )
}

const selector = (tree: ReturnType<typeof render>) => tree.root.findByType(DoseSelector)

describe("a child's epidural infusion", () => {
  const epidural = { infId: "epi", name: "Ropivacaine", rate: "0.1", unit: "mL/kg/hr", route: "EPIDURAL", concentration: "0.2%", color: "#0ea5e9" } as ActiveInfusion
  const child = { target: epidural, startRate: "0.1", pediatricMode: true, pediatricInfusionProfiles: profiles, patientAge: { value: 2000, unit: "DAYS" as const }, patientWeightKg: 12 }

  it("limits the volume by dose at the strength running, and reads out the pump rate", () => {
    const tree = render(<Sheet {...child} />)
    // From 1 year 0.4 mg/kg/hr: 0.2 mL/kg/hr of 0.2%.
    expect(selector(tree).props).toMatchObject({ max: 0.2, unitSuffix: "mL/kg/hr", units: ["mL/kg/hr", "mL/hr"] })
    expect(selector(tree).props.extraHint).toBe("1.2 mL/hr on the pump · 0.2 mg/kg/hr")
  })

  it("takes the pump rate and records it as mL/kg/hr beside it", () => {
    const onChange = vi.fn()
    const tree = render(<Sheet {...child} onChange={onChange} />)
    act(() => { selector(tree).props.onUnitChange("mL/hr") })
    expect(selector(tree).props).toMatchObject({ unitSuffix: "mL/hr", max: 2.4, value: "1.2" })
    act(() => { selector(tree).props.onValueChange("2.5") })
    expect(selector(tree).props.extraHint).toBe("0.208 mL/kg/hr · 0.417 mg/kg/hr")
    act(() => { selector(tree).props.onConfirm() })
    expect(onChange).toHaveBeenLastCalledWith({ rate: 0.208, unit: "mL/kg/hr", volumeRateMlPerHour: 2.5, calculationWeightKg: 12 })
  })
})

describe("an adult noradrenaline infusion with a syringe", () => {
  const noradrenaline = { infId: "nor", name: "Norepinephrine / Noradrenaline", rate: "0.1", unit: "mcg/kg/min", route: "IV", concentration: "4 mg/50 mL", color: "#a855f7" } as ActiveInfusion
  const adult = {
    target: noradrenaline, startRate: "0.1", patientWeightKg: 70, patientIdealWeightKg: 70,
    ranges: { "Norepinephrine / Noradrenaline": { min: 0, max: 3, step: 0.01 } },
    ruleUnits: { "Norepinephrine / Noradrenaline": "mcg/kg/min" },
  }

  it("offers the syringes, the other dose unit and the pump rate, and reads out the pump rate", () => {
    const tree = render(<Sheet {...adult} />)
    expect(selector(tree).props.concentrationOptions).toContain("4 mg/50 mL")
    expect(selector(tree).props.concentrationLabel).toBe("Syringe")
    expect(selector(tree).props.units).toEqual(["mcg/kg/min", "mcg/min", "mL/hr"])
    expect(selector(tree).props.extraHint).toBe("5.25 mL/hr on the pump")
  })

  it("records both rates whichever unit the rate was entered in", () => {
    const onChange = vi.fn()
    const tree = render(<Sheet {...adult} onChange={onChange} />)
    act(() => { selector(tree).props.onConfirm() })
    expect(onChange).toHaveBeenLastCalledWith({ rate: 0.1, unit: "mcg/kg/min", volumeRateMlPerHour: 5.25, calculationWeightKg: 70 })
    act(() => { selector(tree).props.onUnitChange("mL/hr") })
    expect(selector(tree).props.value).toBe("5.3")
    act(() => { selector(tree).props.onValueChange("10.5") })
    expect(selector(tree).props.extraHint).toBe("0.2 mcg/kg/min")
    act(() => { selector(tree).props.onConfirm() })
    expect(onChange).toHaveBeenLastCalledWith({ rate: 0.2, unit: "mcg/kg/min", volumeRateMlPerHour: 10.5, calculationWeightKg: 70 })
    act(() => { selector(tree).props.onUnitChange("mcg/min") })
    expect(selector(tree).props.value).toBe("14")
  })

  it("records the dose rate alone when no syringe is known", () => {
    const onChange = vi.fn()
    const tree = render(<Sheet {...adult} target={{ ...noradrenaline, concentration: undefined }} onChange={onChange} />)
    expect(selector(tree).props.extraHint).toBeUndefined()
    act(() => { selector(tree).props.onConfirm() })
    expect(onChange).toHaveBeenLastCalledWith({ rate: 0.1, unit: "mcg/kg/min", calculationWeightKg: 70 })
  })
})
