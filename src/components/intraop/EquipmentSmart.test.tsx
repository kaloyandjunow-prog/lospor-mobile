import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { calcEquipment } from "@lospor/core/equipment"

const setEquipmentScreen = vi.fn(async () => {})
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key, language: "en", equipmentScreen: "smart", setEquipmentScreen }),
}))

import { render } from "@/test/render"
import { EquipmentScreenCard } from "@/components/settings/EquipmentScreenCard"
import { EquipmentSmart } from "./EquipmentSmart"

const adult = calcEquipment({ clinicalMode: "ADULT", age: null, ageYears: 44, weightKg: 82, heightCm: 182, sex: "MALE", airway: { mallampati: "III", neckMobility: "REDUCED", mouthOpeningCm: 3, cormackLehane: null } } as never)
const child = calcEquipment({ clinicalMode: "PEDIATRIC", age: { value: 4, unit: "YEARS" }, ageYears: null, weightKg: 16, heightCm: 102, sex: "FEMALE", airway: { mallampati: null, neckMobility: null, mouthOpeningCm: null, cormackLehane: null } } as never)

const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)[0]
const present = (tree: ReturnType<typeof render>, id: string) => byId(tree, id) !== undefined
const press = (tree: ReturnType<typeof render>, id: string) => act(() => { byId(tree, id)!.props.onPress() })

function setup(over: Partial<Parameters<typeof EquipmentSmart>[0]> = {}) {
  const onFlag = vi.fn()
  const onUseAirway = vi.fn()
  const tree = render(
    <EquipmentSmart raw={adult} shown={adult} flags={{ urinaryCatheter: false, stomachTube: false }} airwayInUse={[]} onFlag={onFlag} onUseAirway={onUseAirway} {...over} />,
  )
  return { tree, onFlag, onUseAirway }
}

describe("Smart selection, the Equipment tab on the phone (10.2.0)", () => {
  it("shows the six airway numbers, the difficult airway group and a progress count", () => {
    const { tree } = setup()
    for (const label of ["ETT size", "ETT depth (lip)", "LMA size", "Laryngoscope", "Guedel OPA", "Suction catheter"]) expect(present(tree, `equipment-cell-${label}`)).toBe(true)
    expect(present(tree, "equipment-group-Difficult Airway")).toBe(true)
    expect(present(tree, "equipment-group-Airway")).toBe(false)
    expect(byId(tree, "equipment-progress")!.props.children.join("")).toMatch(/^0 \/ \d+$/)
  })

  it("a first tap on the tube only marks it ready; a second marks it in use and writes it", () => {
    const { tree, onUseAirway } = setup()
    press(tree, "equipment-cell-ETT size")
    expect(onUseAirway).not.toHaveBeenCalled()
    expect(byId(tree, "equipment-cell-ETT size")!.props.accessibilityState.selected).toBe(true)
    press(tree, "equipment-cell-ETT size")
    expect(onUseAirway).toHaveBeenCalledWith("ORAL_ETT")
  })

  it("the LMA writes the LMA, and a tube already in use is not written again", () => {
    const { tree, onUseAirway } = setup({ airwayInUse: ["ORAL_ETT"] })
    press(tree, "equipment-cell-LMA size")
    press(tree, "equipment-cell-LMA size")
    expect(onUseAirway).toHaveBeenCalledWith("LMA")
    onUseAirway.mockClear()
    press(tree, "equipment-cell-ETT size")
    expect(onUseAirway).not.toHaveBeenCalled()
  })

  it("the catheter and the NGT set their flag at once, and the flag is the tick", () => {
    const { tree, onFlag } = setup()
    press(tree, "equipment-row-Catheters-NGT")
    expect(onFlag).toHaveBeenCalledWith("stomachTube")
    press(tree, "equipment-row-Catheters-Urinary catheter")
    expect(onFlag).toHaveBeenCalledWith("urinaryCatheter")

    const set = setup({ flags: { urinaryCatheter: true, stomachTube: false } })
    expect(set.tree.root.findAll(node => node.props?.testID === "equipment-row-Catheters-Urinary catheter")[0]!.props.accessibilityState.checked).toBe(true)
    press(set.tree, "equipment-row-Catheters-Urinary catheter")
    expect(set.onFlag).toHaveBeenCalledWith("urinaryCatheter")
  })

  it("any other item is a plain tick that writes nothing", () => {
    const { tree, onFlag, onUseAirway } = setup()
    press(tree, "equipment-cell-Guedel OPA")
    press(tree, "equipment-row-Ventilation-PEEP")
    expect(onFlag).not.toHaveBeenCalled()
    expect(onUseAirway).not.toHaveBeenCalled()
    expect(byId(tree, "equipment-row-Ventilation-PEEP")!.props.accessibilityState.checked).toBe(true)
  })

  it("a size left to the clinician is never written for them", () => {
    const { tree, onUseAirway } = setup({ raw: child, shown: child })
    press(tree, "equipment-cell-Laryngoscope")
    press(tree, "equipment-cell-Laryngoscope")
    expect(onUseAirway).not.toHaveBeenCalled()
  })

  it("a catheter whose size the calculator leaves to the clinician still sets its flag", () => {
    const { tree, onFlag } = setup({ raw: child, shown: child })
    press(tree, "equipment-row-Catheters-Urinary catheter")
    expect(onFlag).toHaveBeenCalledWith("urinaryCatheter")
  })
})

describe("the Equipment tab setting on the phone", () => {
  it("offers Smart selection and Legacy and saves the one picked", () => {
    const tree = render(<EquipmentScreenCard />)
    expect(present(tree, "equipment-screen-smart")).toBe(true)
    act(() => { byId(tree, "equipment-screen-legacy")!.props.onPress() })
    expect(setEquipmentScreen).toHaveBeenCalledWith("legacy")
  })
})
