import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/theme/shade", () => ({ useShade: () => (value: string) => value }))
vi.mock("@/components/ClinicalNumberInput", () => ({ ClinicalNumberInput: () => null }))

import { render } from "@/test/render"
import { FluidStatusHybrid } from "./FluidStatusHybrid"

const props = {
  infusionTotals: [{ name: "Noradrenaline", total: 2, unit: "mg" }],
  bolusTotals: [{ name: "Propofol", total: 100, unit: "mg", count: 1 }],
  weightNote: null,
  crystalloidsMl: 500,
  colloidsMl: null,
  bloodMl: null,
  infusionsMl: 30,
  urinaryCatheter: true,
  urineMl: 250,
  setUrineMl: vi.fn(),
  bloodLossMl: 100,
  setBloodLossMl: vi.fn(),
  tc: (key: string) => key,
}

describe("the Hybrid fluid status summary", () => {
  it("starts as a summary and exposes edit only for clinician measurements", () => {
    const tree = render(<FluidStatusHybrid {...props} />)
    const byId = (id: string) => tree.root.findAll(node => node.props?.testID === id)[0]
    expect(byId("fluid-total-in")).toBeDefined()
    expect(byId("fluid-edit-urine")).toBeUndefined()
    expect(byId("fluid-edit-blood-loss")).toBeUndefined()

    act(() => { byId("fluid-output-toggle")!.props.onPress() })
    expect(byId("fluid-edit-urine")).toBeDefined()
    expect(byId("fluid-edit-blood-loss")).toBeUndefined()
    act(() => { byId("fluid-edit-urine")!.props.onPress() })
    expect(byId("fluid-urine-editor")).toBeDefined()
  })
})
