import type { LogEvent } from "@/lib/intraop-log-event"
import { trendArrow } from "@/lib/intraop-format"

export type EventLabel = { text: string; color: string; sub?: string }
export type EventLabelColors = {
  drugColor: (name: string) => string
  clinicalEventColor: (label: string) => string
}

// Display text / colour / subtitle for a single intraop log event. Pure given
// the drug + clinical-event colour resolvers. Extracted from the screen so the
// event-row rendering can be tested without a renderer.
export function buildEventLabel(ev: LogEvent, prevVital: LogEvent | undefined, colors: EventLabelColors): EventLabel {
  switch (ev.type) {
    case "drug":
      return { text: `${ev.name} ${ev.dose} ${ev.unit}`, color: ev.color ?? colors.drugColor(ev.name ?? ""), sub: ev.category }
    case "vital": {
      const parts: string[] = []
      if (ev.systolic != null && ev.diastolic != null)
        parts.push(`BP ${ev.systolic}${trendArrow(ev.systolic, prevVital?.systolic)}/${ev.diastolic}`)
      if (ev.heartRate != null) parts.push(`HR ${ev.heartRate}${trendArrow(ev.heartRate, prevVital?.heartRate)}`)
      if (ev.spO2     != null) parts.push(`SpO₂ ${ev.spO2}%${trendArrow(ev.spO2, prevVital?.spO2)}`)
      if (ev.etco2    != null) parts.push(`EtCO₂ ${ev.etco2}${trendArrow(ev.etco2, prevVital?.etco2)}`)
      if (ev.temp     != null) parts.push(`${ev.temp}°C`)
      if (ev.bgl      != null) parts.push(`Serum/peripheral glucose ${ev.bgl}`)
      return { text: parts.join("  "), color: "#22c55e" }
    }
    case "clinical_event":
      return { text: ev.label ?? "", color: colors.clinicalEventColor(ev.label?.split(" (")[0] ?? "") }
    case "infusion_start":
      return { text: `${ev.name} ${ev.rate} ${ev.unit}`, color: ev.color ?? "#6366f1", sub: "Infusion started" }
    case "infusion_rate":
      return { text: `${ev.name} → ${ev.rate} ${ev.unit}`, color: ev.color ?? "#6366f1", sub: "Rate changed" }
    case "infusion_stop":
      return { text: `${ev.name} stopped`, color: "#64748b", sub: "Infusion" }
    case "fluid_start":
      return { text: `${ev.name} ${ev.volume} mL`, color: ev.color ?? "#06b6d4", sub: "Fluid" }
    case "fluid_end":
      return { text: `${ev.name} complete`, color: "#64748b", sub: "Fluid" }
    case "agent_start":
      return { text: ev.value ? `${ev.name} ${ev.value}%` : `${ev.name} on`, color: ev.color ?? "#a855f7", sub: "Volatile" }
    case "agent_stop":
      return { text: `${ev.name} off`, color: "#64748b", sub: "Volatile" }
    case "gas_start":
      return { text: `FGF ${ev.fgf}L/min · FiO2 ${ev.fio2}%`, color: "#6366f1", sub: "Gas settings started" }
    case "gas_change":
      return { text: `FGF ${ev.fgf}L/min · FiO2 ${ev.fio2}%`, color: "#6366f1", sub: "Gas settings changed" }
    case "gas_stop":
      return { text: "Gas settings stopped", color: "#64748b", sub: "Gas settings" }
    default:
      return { text: "Event", color: "#64748b" }
  }
}
