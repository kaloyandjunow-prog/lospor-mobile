import { useState } from "react"
import { uid } from "@/lib/intraop-log-event"
import type { LogEvent, ActiveInfusion } from "@/lib/intraop-log-event"

type InfusionOption = { name: string; unit: string; color: string }
type CodedIdentity = { drugId?: string; atcCode?: string; inn?: string }

// Infusion start/rate-change/stop. `activeInfusions` is shared state (read
// elsewhere for the running-items strip and end-case sheet), so it's passed
// in rather than owned here — same pattern as useFluidEntry/useAgentEntry.
export function useInfusionEntry(
  save: (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent>,
  setEntryTs: (ts: string | null) => void,
  setActiveInfusions: (updater: (prev: ActiveInfusion[]) => ActiveInfusion[]) => void,
  // Coded identity by drug name — empty today, see use-drug-entry.ts.
  infusionCodes: Record<string, CodedIdentity> = {},
) {
  const [infOpen, setInfOpen] = useState(false)
  const [infDrug, setInfDrug] = useState<InfusionOption | null>(null)
  const [infRate, setInfRate] = useState("")
  const [infRoute, setInfRoute] = useState<string | undefined>(undefined)
  const [infConcentration, setInfConcentration] = useState<string | undefined>(undefined)

  const [infActOpen, setInfActOpen] = useState(false)
  const [infActTgt, setInfActTgt]   = useState<ActiveInfusion | null>(null)
  const [infActRate, setInfActRate] = useState("")
  const [infActConcentration, setInfActConcentration] = useState<string | undefined>(undefined)

  function openInfusion(ts?: string) {
    setEntryTs(ts ?? null)
    setInfOpen(true)
  }

  async function confirmInfusion() {
    if (!infDrug || !infRate) return
    const codes = infusionCodes[infDrug.name]
    const inf: ActiveInfusion = { infId: uid(), name: infDrug.name, rate: infRate, unit: infDrug.unit, color: infDrug.color, concentration: infConcentration, route: infRoute, drugId: codes?.drugId, atcCode: codes?.atcCode, inn: codes?.inn }
    setActiveInfusions(prev => [...prev, inf])
    await save({ type: "infusion_start", infId: inf.infId, name: inf.name, rate: inf.rate, unit: inf.unit, color: inf.color, concentration: inf.concentration, drugRoute: inf.route, drugId: inf.drugId, atcCode: inf.atcCode, inn: inf.inn })
    setInfOpen(false); setInfDrug(null); setInfRate(""); setInfRoute(undefined); setInfConcentration(undefined)
  }

  async function stopInfusion(inf: ActiveInfusion) {
    setActiveInfusions(prev => prev.filter(x => x.infId !== inf.infId))
    await save({ type: "infusion_stop", infId: inf.infId, name: inf.name, color: inf.color })
  }

  async function changeRate(inf: ActiveInfusion, rate: string, concentration?: string) {
    setActiveInfusions(prev => prev.map(x => x.infId === inf.infId ? { ...x, rate, concentration: concentration ?? x.concentration } : x))
    // Use the current timestamp so eventsToTimetable can compute the correct column for the split
    await save({ type: "infusion_rate", infId: inf.infId, name: inf.name, rate, unit: inf.unit, color: inf.color, concentration: concentration ?? inf.concentration })
    setInfActOpen(false); setInfActTgt(null); setInfActRate(""); setInfActConcentration(undefined)
  }

  return {
    infOpen, setInfOpen, infDrug, setInfDrug, infRate, setInfRate,
    infRoute, setInfRoute, infConcentration, setInfConcentration,
    infActOpen, setInfActOpen, infActTgt, setInfActTgt, infActRate, setInfActRate,
    infActConcentration, setInfActConcentration,
    openInfusion, confirmInfusion, stopInfusion, changeRate,
  }
}
