import type { SheetAction } from "./action-sheet-store"

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

export function buildEmergencyShortcutSheet(
  kind: EmergencyShortcutKind,
  cancelLabel: string,
  callbacks: EmergencyShortcutCallbacks,
): EmergencyShortcutSheet {
  if (kind === "hypotension") {
    return {
      title: "Hypotension",
      message: "Log event or open a common rescue drug.",
      actions: [
        { label: "Phenylephrine 100 mcg", onPress: () => callbacks.openDrugPreset("Phenylephrine", "100") },
        { label: "Ephedrine 10 mg", onPress: () => callbacks.openDrugPreset("Ephedrine", "10") },
        { label: "Log event", onPress: () => callbacks.logEvent("Hypotension", "#ef4444") },
        { label: cancelLabel, cancel: true },
      ],
    }
  }
  if (kind === "desaturation") {
    return {
      title: "Desaturation",
      message: "Fast airway/oxygenation event.",
      actions: [
        { label: "Log desaturation", onPress: () => callbacks.logEvent("Desaturation", "#06b6d4") },
        { label: "Airway note", onPress: callbacks.openAirwayDetail },
        { label: cancelLabel, cancel: true },
      ],
    }
  }
  if (kind === "bradycardia") {
    return {
      title: "Bradycardia",
      message: "Log event or open atropine.",
      actions: [
        { label: "Atropine 0.5 mg", onPress: () => callbacks.openDrugPreset("Atropine", "0.5") },
        { label: "Log event", onPress: () => callbacks.logEvent("Bradycardia", "#22c55e") },
        { label: cancelLabel, cancel: true },
      ],
    }
  }
  return {
    title: "Difficult airway",
    message: "Log a difficult airway event or add airway detail.",
    actions: [
      { label: "Airway detail", onPress: callbacks.openAirwayDetail },
      { label: "Log difficult airway", onPress: () => callbacks.logEvent("Difficult airway", "#6366f1") },
      { label: cancelLabel, cancel: true },
    ],
  }
}
