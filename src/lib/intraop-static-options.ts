import type { ClinicalStringKey } from "./preferences-context"
import { COMPLICATION_CATEGORIES } from "@lospor/core/complications"

export const COMPLICATION_TC_TITLES: Record<string, ClinicalStringKey> = {
  cardiovascular: "compCatCardiovascular",
  respiratory: "compCatRespiratory",
  neurological: "compCatNeurological",
  metabolic: "compCatMetabolic",
  drug: "compCatDrug",
  haematological: "compCatHaematological",
  equipment: "compCatEquipment",
  surgical: "compCatSurgical",
}

// Single source of truth is @lospor/core/complications (shared with
// lospor-app). Local shape ({id, title, items}) preserved so existing
// consumers (buildIntraopSheetsProps.ts etc.) don't need to change; the
// English title stays here for the `tc()` fallback, the Bulgarian title
// lives in clinical-strings.ts via COMPLICATION_TC_TITLES above.
export const COMPLICATION_GROUPS = COMPLICATION_CATEGORIES.map(({ id, title, items }) => ({ id, title, items }))

export const PREMED_QUICK = [
  "Midazolam 7.5 mg PO",
  "Midazolam 3.75 mg PO",
  "Temazepam 10 mg PO",
  "Lorazepam 1 mg PO",
  "Hydroxyzine 25 mg PO",
  "Omeprazole 20 mg PO",
  "Metoclopramide 10 mg PO",
  "Ondansetron 4 mg PO",
  "Paracetamol 1g PO",
  "Clonidine 0.1 mg PO",
]
