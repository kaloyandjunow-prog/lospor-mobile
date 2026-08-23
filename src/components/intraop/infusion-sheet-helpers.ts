import type { PediatricInfusionSelectionResolution } from "@lospor/core/clinical-rules"
import type { SearchOnlyMedicationOption } from "@/lib/hidden-clinical-options"
import type { DrugFormulation } from "@/lib/intraop-log-event"
import type { InfusionRuleSelection } from "@/lib/use-infusion-entry"
import type { InfusionPickerOption, InfusionPickerResult } from "@/components/intraop/InfusionPickerMenu"

export type InfusionOption = InfusionPickerOption
export type Range = { min: number; max: number; step: number }
export type InfProfile = Range & {
  mode?: string
  quickValues: number[]
  unit: string
  concentrationOptions?: string[]
  suggestedRate?: number
  suggestedConcentration?: string
  advisory?: string | null
}
export type ActiveInfProfile = InfProfile & {
  route?: string
  routes?: string[]
  concentrationUnit?: string
  formulationOptions?: DrugFormulation[]
  formulation?: DrugFormulation
  manualEntryOnly?: boolean
  rule?: InfusionRuleSelection
  disposition?: PediatricInfusionSelectionResolution["disposition"]
}

export function filterInfusionPickerResults({
  query,
  visibleInfusions,
  searchOnlyInfusions,
  displayName,
}: {
  query: string
  visibleInfusions: readonly InfusionOption[]
  searchOnlyInfusions: readonly SearchOnlyMedicationOption[]
  displayName: (name: string) => string
}): InfusionPickerResult[] {
  const normalizedQuery = query.trim().toLowerCase()
  return normalizedQuery
    ? [
        ...visibleInfusions
          .filter(drug => [drug.name, displayName(drug.name)]
            .some(value => value.toLowerCase().includes(normalizedQuery)))
          .map(drug => ({ ...drug, searchOnly: null as SearchOnlyMedicationOption | null })),
        ...searchOnlyInfusions
          .filter(drug => [drug.name, displayName(drug.name)]
            .some(value => value.toLowerCase().includes(normalizedQuery)))
          .map(drug => ({ ...drug, searchOnly: drug })),
      ]
    : visibleInfusions.map(drug => ({ ...drug, searchOnly: null as SearchOnlyMedicationOption | null }))
}
