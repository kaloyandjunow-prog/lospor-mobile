import { useState } from "react"
import { uid } from "@/lib/intraop-log-event"
import type { LogEvent, ActiveFluid } from "@/lib/intraop-log-event"

type FluidOption = { name: string; cat: string; color: string }

// Fluid start/end. `activeFluids` is shared state (read elsewhere in the
// screen for the running-items strip and end-case sheet), so it's passed in
// rather than owned here — same as activeAgent in useAgentEntry.
export function useFluidEntry(
  save: (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent>,
  setEntryTs: (ts: string | null) => void,
  setActiveFluids: (updater: (prev: ActiveFluid[]) => ActiveFluid[]) => void,
) {
  const [flOpen, setFlOpen]   = useState(false)
  const [flFluid, setFlFluid] = useState<FluidOption | null>(null)
  const [flVol, setFlVol]     = useState("500")

  const [flEndOpen, setFlEndOpen]     = useState(false)
  const [flEndTarget, setFlEndTarget] = useState<ActiveFluid | null>(null)
  const [flEndCustom, setFlEndCustom] = useState("")

  function openFluid(ts?: string) {
    setEntryTs(ts ?? null)
    setFlOpen(true)
  }

  async function confirmFluid() {
    if (!flFluid) return
    const fl: ActiveFluid = { fluidId: uid(), name: flFluid.name, volume: flVol, color: flFluid.color }
    setActiveFluids(prev => [...prev, fl])
    await save({ type: "fluid_start", fluidId: fl.fluidId, name: fl.name, volume: fl.volume, color: fl.color, category: flFluid.cat })
    setFlOpen(false); setFlFluid(null); setFlVol("500")
  }

  function openFluidEnd(fl: ActiveFluid) {
    setFlEndTarget(fl); setFlEndCustom(""); setFlEndOpen(true)
  }

  async function confirmFluidEnd(label?: string) {
    if (!flEndTarget) return
    const fl = flEndTarget
    setActiveFluids(prev => prev.filter(x => x.fluidId !== fl.fluidId))
    const name = label ? `${fl.name} (${label})` : fl.name
    await save({ type: "fluid_end", fluidId: fl.fluidId, name, color: fl.color })
    setFlEndOpen(false); setFlEndTarget(null)
  }

  // Direct fluid stop used by end-case sheet (no modal, no flEndTarget state required)
  async function stopFluidDirect(fl: ActiveFluid) {
    setActiveFluids(prev => prev.filter(x => x.fluidId !== fl.fluidId))
    await save({ type: "fluid_end", fluidId: fl.fluidId, name: fl.name, color: fl.color })
  }

  return {
    flOpen, setFlOpen, flFluid, setFlFluid, flVol, setFlVol,
    flEndOpen, setFlEndOpen, flEndTarget, setFlEndTarget, flEndCustom, setFlEndCustom,
    openFluid, confirmFluid, openFluidEnd, confirmFluidEnd, stopFluidDirect,
  }
}
