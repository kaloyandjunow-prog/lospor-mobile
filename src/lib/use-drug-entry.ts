import { useState } from "react"
import type { LogEvent } from "@/lib/intraop-log-event"

type DrugCat = { cat: string; color: string; drugs: { name: string; unit: string }[] }
type DrugOption = { name: string; unit: string }
type InfusionOption = { name: string; unit: string; color: string }
type CodedIdentity = { drugId?: string; atcCode?: string; inn?: string }

// Bolus drug entry. startDrugAsInfusion hands off to the infusion domain
// (closes this sheet, opens the infusion one pre-selected with the same
// drug) — a genuine cross-domain action, which is why this hook takes the
// infusion hook's setters as parameters rather than mobile duplicating that
// transition logic, or the infusion hook reaching back into this one.
export function useDrugEntry(
  save: (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent>,
  setEntryTs: (ts: string | null) => void,
  drugCats: DrugCat[],
  infDrugs: InfusionOption[],
  setInfDrug: (d: InfusionOption | null) => void,
  setInfRate: (v: string) => void,
  setInfOpen: (v: boolean) => void,
  // Coded identity by drug name, sourced from the OptionLibrary catalog —
  // empty today (catalog isn't populated yet), but once it is, this is what
  // carries drugId/atcCode/inn into the saved event instead of dropping it.
  drugCodes: Record<string, CodedIdentity> = {},
  infusionRatePresets: Record<string, string[]> = {},
) {
  const [drugOpen, setDrugOpen] = useState(false)
  const [drugCat, setDrugCat]   = useState<DrugCat | null>(null)
  const [drugPick, setDrugPick] = useState<DrugOption | null>(null)
  const [drugDose, setDrugDose] = useState("")
  const [drugRoute, setDrugRoute] = useState<string | undefined>(undefined)
  const [drugConcentration, setDrugConcentration] = useState<string | undefined>(undefined)

  function openDrug(ts?: string) {
    setEntryTs(ts ?? null)
    setDrugCat(null); setDrugPick(null); setDrugDose(""); setDrugRoute(undefined); setDrugConcentration(undefined); setDrugOpen(true)
  }

  async function confirmDrug() {
    if (!drugPick || !drugDose) return
    const codes = drugCodes[drugPick.name]
    await save({ type: "drug", name: drugPick.name, dose: drugDose, unit: drugPick.unit,
      category: drugCat?.cat, color: drugCat?.color as string, drugRoute: drugRoute, concentration: drugConcentration,
      drugId: codes?.drugId, atcCode: codes?.atcCode, inn: codes?.inn })
    setDrugOpen(false); setDrugCat(null); setDrugPick(null); setDrugDose(""); setDrugRoute(undefined); setDrugConcentration(undefined)
  }

  function startDrugAsInfusion() {
    if (!drugPick) return
    const infMatch = infDrugs.find(d => d.name === drugPick.name)
    if (!infMatch) return
    // Transfer to infusion sheet pre-selected with this drug
    setDrugOpen(false); setDrugCat(null); setDrugPick(null); setDrugDose(""); setDrugRoute(undefined); setDrugConcentration(undefined)
    setInfDrug(infMatch); setInfRate(infusionRatePresets[infMatch.name]?.[0] ?? ""); setInfOpen(true)
  }

  function openDrugPreset(name: string, dose = "") {
    for (const cat of drugCats) {
      const found = cat.drugs.find(d => d.name === name)
      if (found) {
        setDrugCat(cat)
        setDrugPick(found)
        setDrugDose(dose)
        setDrugOpen(true)
        return
      }
    }
    openDrug()
  }

  return {
    drugOpen, setDrugOpen, drugCat, setDrugCat, drugPick, setDrugPick, drugDose, setDrugDose,
    drugRoute, setDrugRoute, drugConcentration, setDrugConcentration,
    openDrug, confirmDrug, startDrugAsInfusion, openDrugPreset,
  }
}
