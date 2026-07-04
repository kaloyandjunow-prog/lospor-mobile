import type { TimetableData, VitalsEntry } from "@/components/IntraopTimetable"
import type { LogEvent } from "@/lib/intraop-log-event"

export type RunningItem = { id: string; label: string; color: string }

// Items "running" at a given 5-minute column: active agents, gas settings
// (latest change at/before the column), infusions (rate active at the column)
// and fluids. Pure projection of the timetable for the running strip.
export function runningItemsAt(timetable: TimetableData, col: number): RunningItem[] {
  const items: RunningItem[] = []
  for (const a of timetable.agents) {
    if (col >= a.startCol && col <= a.endCol) items.push({ id: `agent-${a.name}`, label: a.name, color: a.color })
  }
  for (const gas of timetable.gasSettings ?? []) {
    if (col >= gas.startCol && col <= gas.endCol) {
      const sorted = (gas.settingsChanges ?? []).slice().sort((a, b) => a.col - b.col)
      const active = sorted.filter(change => change.col <= col).pop()
      const fgf = active?.fgf ?? gas.fgf
      const fio2 = active?.fio2 ?? gas.fio2
      items.push({ id: "gas-settings", label: `FGF ${fgf}L/min · FiO2 ${fio2}%`, color: "#818cf8" })
    }
  }
  for (const i of timetable.infusions) {
    if (col >= i.startCol && col <= i.endCol) {
      // Rate ACTIVE at this column: latest rateChange at/before col, else base rate.
      const sorted = (i.rateChanges ?? []).slice().sort((a, b) => a.col - b.col)
      const active = sorted.filter(rc => rc.col <= col).pop()
      const curRate = active?.rate ?? i.rate
      items.push({ id: `inf-${i.id}`, label: `${i.name} ${curRate}`, color: i.color })
    }
  }
  for (const f of timetable.fluids) {
    if (col >= f.startCol && col <= f.endCol) items.push({ id: `fluid-${f.id}`, label: `${f.name} ${f.volume}mL`, color: f.color })
  }
  return items // no cap — show all parallel infusions, fluids and agents
}

export function runningItemsByCol(timetable: TimetableData, cols: number[]): Map<number, RunningItem[]> {
  const rows = new Map<number, RunningItem[]>()
  for (const col of cols) rows.set(col, [])

  function push(col: number, item: RunningItem) {
    rows.get(col)?.push(item)
  }

  for (const a of timetable.agents) {
    for (const col of cols) {
      if (col >= a.startCol && col <= a.endCol) push(col, { id: `agent-${a.name}`, label: a.name, color: a.color })
    }
  }
  for (const gas of timetable.gasSettings ?? []) {
    const sorted = (gas.settingsChanges ?? []).slice().sort((a, b) => a.col - b.col)
    for (const col of cols) {
      if (col < gas.startCol || col > gas.endCol) continue
      const active = sorted.filter(change => change.col <= col).pop()
      const fgf = active?.fgf ?? gas.fgf
      const fio2 = active?.fio2 ?? gas.fio2
      push(col, { id: "gas-settings", label: `FGF ${fgf}L/min В· FiO2 ${fio2}%`, color: "#818cf8" })
    }
  }
  for (const i of timetable.infusions) {
    const sorted = (i.rateChanges ?? []).slice().sort((a, b) => a.col - b.col)
    for (const col of cols) {
      if (col < i.startCol || col > i.endCol) continue
      const active = sorted.filter(rc => rc.col <= col).pop()
      const curRate = active?.rate ?? i.rate
      push(col, { id: `inf-${i.id}`, label: `${i.name} ${curRate}`, color: i.color })
    }
  }
  for (const f of timetable.fluids) {
    for (const col of cols) {
      if (col >= f.startCol && col <= f.endCol) push(col, { id: `fluid-${f.id}`, label: `${f.name} ${f.volume}mL`, color: f.color })
    }
  }
  return rows
}

export function vitalSummary(v?: VitalsEntry): string {
  if (!v) return ""
  const parts: string[] = []
  if (v.systolic != null && v.diastolic != null) parts.push(`${v.systolic}/${v.diastolic}`)
  if (v.heartRate != null) parts.push(`HR ${v.heartRate}`)
  if (v.spO2 != null) parts.push(`SpO2 ${v.spO2}`)
  if (v.etco2 != null) parts.push(`CO2 ${v.etco2}`)
  return parts.join("  ")
}

export type RowSummary = {
  criticalParts: string[]
  normalParts: string[]
  drugParts: string[]
  hasCritical: boolean
  hasUnsynced: boolean
}

// Priority summary for a timetable row: vitals split into critical vs normal by
// clinical thresholds (SBP<90, HR<50 or >130, SpO2<95, T<35), plus the first
// four drug/clinical-event labels and an unsynced flag. Pure + testable.
export function buildRowSummary(
  vital: VitalsEntry | undefined,
  rowEvents: LogEvent[],
  labelOf: (ev: LogEvent) => string,
): RowSummary {
  const criticalParts: string[] = []
  const normalParts: string[] = []
  if (vital) {
    if (vital.systolic != null && vital.systolic < 90) criticalParts.push(`BP ${vital.systolic}/${vital.diastolic ?? "?"}`)
    else if (vital.systolic != null) normalParts.push(`${vital.systolic}/${vital.diastolic ?? "?"}`)

    if (vital.heartRate != null && (vital.heartRate < 50 || vital.heartRate > 130)) criticalParts.push(`HR ${vital.heartRate}`)
    else if (vital.heartRate != null) normalParts.push(`HR ${vital.heartRate}`)

    if (vital.spO2 != null && vital.spO2 < 95) criticalParts.push(`SpO2 ${vital.spO2}`)
    else if (vital.spO2 != null) normalParts.push(`SpO2 ${vital.spO2}`)

    if (vital.temp != null && vital.temp < 35) criticalParts.push(`T ${vital.temp}`)
    else if (vital.temp != null) normalParts.push(`T ${vital.temp}`)

    if (vital.etco2 != null) normalParts.push(`CO2 ${vital.etco2}`)
  }
  const drugParts = rowEvents
    .filter(ev => ev.type === "drug" || ev.type === "clinical_event")
    .slice(0, 4)
    .map(labelOf)
  return {
    criticalParts,
    normalParts,
    drugParts,
    hasCritical: criticalParts.length > 0,
    hasUnsynced: rowEvents.some(ev => ev.syncStatus),
  }
}
