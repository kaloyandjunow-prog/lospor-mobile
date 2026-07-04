import type { SheetAction } from "./action-sheet-store"
import type { ClinicalStringKey } from "./preferences-context"

export type EmergencyShortcutKind = "hypotension" | "desaturation" | "bradycardia" | "airway"

type EmergencyShortcutCallbacks = {
  openDrugPreset: (name: string, dose: string) => void
  logEvent: (label: string, color: string) => void
  openAirwayDetail: () => void
}

export type EmergencyShortcutSheet = {
  title: string
  message: string
  actions: SheetAction[]
}

// Condition titles (Hypotension, Desaturation, Bradycardia, Difficult airway)
// intentionally stay untranslated by tc() — they must match the same values
// used elsewhere as complication/event labels (see intraop-static-options.ts).
export function buildEmergencyShortcutSheet(
  kind: EmergencyShortcutKind,
  cancelLabel: string,
  callbacks: EmergencyShortcutCallbacks,
  tc: (key: ClinicalStringKey) => string,
): EmergencyShortcutSheet {
  if (kind === "hypotension") {
    return {
      title: "Hypotension",
      message: tc("esHypotensionMsg"),
      actions: [
        { label: "Phenylephrine 100 mcg", onPress: () => callbacks.openDrugPreset("Phenylephrine", "100") },
        { label: "Ephedrine 10 mg", onPress: () => callbacks.openDrugPreset("Ephedrine", "10") },
        { label: tc("esLogEvent"), onPress: () => callbacks.logEvent("Hypotension", "#ef4444") },
        { label: cancelLabel, cancel: true },
      ],
    }
  }
  if (kind === "desaturation") {
    return {
      title: "Desaturation",
      message: tc("esDesaturationMsg"),
      actions: [
        { label: tc("esLogDesaturation"), onPress: () => callbacks.logEvent("Desaturation", "#06b6d4") },
        { label: tc("esAirwayNote"), onPress: callbacks.openAirwayDetail },
        { label: cancelLabel, cancel: true },
      ],
    }
  }
  if (kind === "bradycardia") {
    return {
      title: "Bradycardia",
      message: tc("esBradycardiaMsg"),
      actions: [
        { label: "Atropine 0.5 mg", onPress: () => callbacks.openDrugPreset("Atropine", "0.5") },
        { label: tc("esLogEvent"), onPress: () => callbacks.logEvent("Bradycardia", "#22c55e") },
        { label: cancelLabel, cancel: true },
      ],
    }
  }
  return {
    title: "Difficult airway",
    message: tc("esAirwayMsg"),
    actions: [
      { label: tc("esAirwayDetail"), onPress: callbacks.openAirwayDetail },
      { label: tc("esLogDifficultAirway"), onPress: () => callbacks.logEvent("Difficult airway", "#6366f1") },
      { label: cancelLabel, cancel: true },
    ],
  }
}
