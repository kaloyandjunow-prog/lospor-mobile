import { describe, expect, it, vi } from "vitest"
import { buildEmergencyShortcutSheet, type EmergencyShortcutKind } from "./intraop-emergency-shortcuts"

function callbacks() {
  return {
    openDrugPreset: vi.fn(),
    logEvent: vi.fn(),
    openAirwayDetail: vi.fn(),
  }
}

describe("buildEmergencyShortcutSheet", () => {
  it.each([
    ["hypotension", "Hypotension", ["Phenylephrine 100 mcg", "Ephedrine 10 mg", "Log event", "Cancel"]],
    ["desaturation", "Desaturation", ["Log desaturation", "Airway note", "Cancel"]],
    ["bradycardia", "Bradycardia", ["Atropine 0.5 mg", "Log event", "Cancel"]],
    ["airway", "Difficult airway", ["Airway detail", "Log difficult airway", "Cancel"]],
  ] as [EmergencyShortcutKind, string, string[]][])("builds %s actions", (kind, title, labels) => {
    const sheet = buildEmergencyShortcutSheet(kind, "Cancel", callbacks())
    expect(sheet.title).toBe(title)
    expect(sheet.actions.map(action => action.label)).toEqual(labels)
    expect(sheet.actions.at(-1)?.cancel).toBe(true)
  })

  it("binds drug preset, event, and airway callbacks", () => {
    const hypotensionCallbacks = callbacks()
    const hypotension = buildEmergencyShortcutSheet("hypotension", "Cancel", hypotensionCallbacks)
    hypotension.actions[0].onPress?.()
    hypotension.actions[2].onPress?.()
    expect(hypotensionCallbacks.openDrugPreset).toHaveBeenCalledWith("Phenylephrine", "100")
    expect(hypotensionCallbacks.logEvent).toHaveBeenCalledWith("Hypotension", "#ef4444")

    const airwayCallbacks = callbacks()
    const airway = buildEmergencyShortcutSheet("airway", "Cancel", airwayCallbacks)
    airway.actions[0].onPress?.()
    expect(airwayCallbacks.openAirwayDetail).toHaveBeenCalledOnce()
  })
})
