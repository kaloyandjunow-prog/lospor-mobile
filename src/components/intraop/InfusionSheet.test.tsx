import React from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("expo-haptics", () => ({}))

import { render } from "@/test/render"
import { InfusionSheet } from "./InfusionSheet"
import { PreferencesProvider } from "@/lib/preferences-context"
import { AuthProvider } from "@/lib/auth-context"
import type { PediatricInfusionProfileRule } from "@lospor/core/clinical-rules"

/**
 * A ruleset can withdraw one route of an infusion rather than the whole drug.
 * The chart dropped those from the route list; this sheet offered them, and
 * picking one left an empty box with no stated reason, because nothing resolves
 * for a withdrawn route.
 */

function renderSheet(element: React.ReactElement) {
  return render(
    <AuthProvider>
      <PreferencesProvider>{element}</PreferencesProvider>
    </AuthProvider>,
  )
}

const rule = (
  routeDispositions: Record<string, "AUTO" | "MANUAL" | "HIDDEN">,
): PediatricInfusionProfileRule => ({
  ruleKey: "ped.inf.test",
  ruleVersion: "1",
  itemKey: "Testamine",
  labelEn: "Testamine",
  labelBg: null,
  category: null,
  disposition: "AUTO",
  routeDispositions,
  manualEntryOnly: false,
  routeManualEntryOnly: {},
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 18 * 366,
  minimumWeightKg: null,
  minimumWeightInclusive: true,
  maximumWeightKg: null,
  maximumWeightInclusive: false,
  routineSuggestion: false,
  advisory: null,
  profile: {
    kind: "infusion",
    mode: "rate",
    rounding: "nearest_step",
    quickValues: [1],
    routes: Object.keys(routeDispositions),
    defaultRoute: "IV",
    weightBasis: "TBW",
    unit: "mcg/kg/min",
    min: 0,
    max: 10,
    step: 0.1,
  },
  unit: null,
  routeUnits: {},
  manualUnit: null,
  sourceIds: [],
  origin: "PLATFORM",
  presetId: "preset",
})

const common = {
  visible: true,
  onClose: () => {},
  infDrugs: [{ name: "Testamine", unit: "mcg/kg/min", color: "#3b82f6" }],
  favouriteNames: [],
  scenarios: [],
  ratePresets: {},
  infRate: "",
  setInfRate: () => {},
  onConfirm: () => {},
  setInfDrug: () => {},
  pediatricMode: true,
  patientAge: { value: 5, unit: "YEARS" as const },
  patientWeightKg: 18,
}

describe("InfusionSheet route visibility", () => {
  it("does not offer a route the ruleset has withdrawn", () => {
    const tree = renderSheet(
      <InfusionSheet
        {...common}
        infDrug={{ name: "Testamine", unit: "mcg/kg/min", color: "#3b82f6" }}
        pediatricInfusionProfiles={[rule({ IV: "AUTO", IM: "AUTO", INTRAOSSEOUS: "HIDDEN" })]}
      />,
    )
    const rendered = JSON.stringify(tree.toJSON())

    // Two routes survive, so the selector is still drawn.
    expect(rendered).toContain("IM")
    expect(rendered, "a withdrawn route was still offered").not.toContain("INTRAOSSEOUS")
  })

  it("still offers a route that is merely manual", () => {
    // MANUAL means "type the rate yourself", not "not available".
    const tree = renderSheet(
      <InfusionSheet
        {...common}
        infDrug={{ name: "Testamine", unit: "mcg/kg/min", color: "#3b82f6" }}
        pediatricInfusionProfiles={[rule({ IV: "AUTO", INTRAOSSEOUS: "MANUAL" })]}
      />,
    )
    const rendered = JSON.stringify(tree.toJSON())

    expect(rendered).toContain("INTRAOSSEOUS")
  })
})
