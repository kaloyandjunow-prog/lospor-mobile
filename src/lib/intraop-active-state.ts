import type { LogEvent, ActiveInfusion, ActiveFluid, ActiveGasSettings } from "@/lib/intraop-log-event"

export type ActiveAgent = { name: string; color: string; percent?: number } | null

// Replays the chronological event log into the items currently "running" (shown
// in the intraop running strip): open infusions with their latest rate, open
// fluids, the active volatile agent, and the current gas settings. Pure +
// testable; extracted from the intraop screen's loadCase. `chronoLog` must be
// oldest→newest.
export function rebuildActiveState(chronoLog: LogEvent[]): {
  infusions: ActiveInfusion[]
  fluids: ActiveFluid[]
  agent: ActiveAgent
  gas: ActiveGasSettings
} {
  const infMap: Record<string, ActiveInfusion> = {}
  const flMap: Record<string, ActiveFluid> = {}
  let agent: ActiveAgent = null
  let gas: ActiveGasSettings = null

  for (const ev of chronoLog) {
    if (ev.type === "infusion_start")
      infMap[ev.infId!] = { infId: ev.infId!, name: ev.name!, rate: ev.rate!, unit: ev.unit!, color: ev.color!, concentration: ev.concentration, route: ev.drugRoute }
    else if (ev.type === "infusion_stop") delete infMap[ev.infId!]
    else if (ev.type === "infusion_rate" && infMap[ev.infId!]) { infMap[ev.infId!].rate = ev.rate!; if (ev.concentration) infMap[ev.infId!].concentration = ev.concentration }
    else if (ev.type === "fluid_start")
      flMap[ev.fluidId!] = { fluidId: ev.fluidId!, name: ev.name!, volume: ev.volume!, color: ev.color! }
    else if (ev.type === "fluid_end") delete flMap[ev.fluidId!]
    else if (ev.type === "agent_start") agent = { name: ev.name!, color: ev.color!, percent: ev.value != null ? Number(ev.value) : undefined }
    else if (ev.type === "agent_stop") agent = null
    else if (ev.type === "gas_start" || ev.type === "gas_change") gas = { fgf: ev.fgf!, carrierGas: ev.carrierGas ?? null, fio2: ev.fio2!, fiAir: ev.fiAir, fiN2O: ev.fiN2O }
    else if (ev.type === "gas_stop") gas = null
  }

  return { infusions: Object.values(infMap), fluids: Object.values(flMap), agent, gas }
}
