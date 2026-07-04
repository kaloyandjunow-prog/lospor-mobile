import type { PremDrug } from "./intraop-types"

export function formatPremedicationEntry(drug: Pick<PremDrug, "name" | "unit">, dose: string, route: string): string {
  return `${drug.name} ${dose} ${drug.unit} ${route}`
}

export function addOrReplacePremedicationEntry(previous: string, drugName: string, entry: string): string {
  const items = previous ? previous.split(";").map(item => item.trim()).filter(Boolean) : []
  const filtered = items.filter(item => !item.startsWith(`${drugName} `))
  return [...filtered, entry].join("; ")
}

export function buildPremedicationPatch(
  eveningText: string,
  morningText: string,
  overrides?: { evening?: string | null; morning?: string | null },
): { premedicationEvening: string | null; premedicationMorning: string | null } {
  return {
    premedicationEvening: overrides && "evening" in overrides ? (overrides.evening ?? null) : (eveningText.trim() || null),
    premedicationMorning: overrides && "morning" in overrides ? (overrides.morning ?? null) : (morningText.trim() || null),
  }
}
