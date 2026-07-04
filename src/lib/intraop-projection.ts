/* eslint-disable @typescript-eslint/no-explicit-any */
// Pure projection/conversion between the intraop event log and the timetable
// widget's column model, plus the time/column helpers they share. Mirrors web's
// projectTimetable. Extracted from cases/intraop/[id].tsx so it is unit-testable.
import type { LogEvent } from "@/lib/intraop-log-event"
import type { TimetableData, VitalsEntry } from "@/components/IntraopTimetable"

// Replays the event log (newest-first) into the timetable's per-5-minute-column
// lanes (vitals/drugs/infusions/fluids/agents/gas). Open items extend one column
// past the now-marker.
export function eventsToTimetable(log: LogEvent[], startTs: Date, now?: Date): TimetableData {
  function gasFractions(carrierGas: string | null | undefined, fio2: number | undefined) {
    const safeFio2 = carrierGas == null ? 100 : Math.min(100, Math.max(21, Number(fio2 ?? 21)))
    return {
      fio2: safeFio2,
      fiAir: carrierGas === "air" ? 100 - safeFio2 : 0,
      fiN2O: carrierGas === "n2o" ? 100 - safeFio2 : 0,
    }
  }
  function tsToCol(ts: string): number {
    const ms = new Date(ts).getTime() - startTs.getTime()
    return Math.max(0, Math.floor(ms / (5 * 60_000)))
  }
  const nowCol = now ? Math.floor((now.getTime() - startTs.getTime()) / (5 * 60_000)) : 0

  const vitals: VitalsEntry[] = []
  const drugs: { colIdx: number; name: string; dose: string; unit: string; drugId?: string; atcCode?: string; inn?: string; route?: string }[] = []
  const infusions: any[] = []
  const fluids: any[] = []
  const agents: any[] = []
  const gasSettings: any[] = []

  // log is newest-first; process oldest-first for state reconstruction
  const chrono = [...log].reverse()

  const activeInfMap: Record<string, { startCol: number; ev: LogEvent; initialRate: string; rateChanges: { col: number; rate: string; unit: string; concentration?: string }[] }> = {}
  const activeFluidMap: Record<string, { startCol: number; ev: LogEvent }> = {}
  let agentStart: { name: string; color: string; col: number } | null = null
  let activeGas: { startCol: number; fgf: number; carrierGas: string | null; fio2: number; fiAir: number; fiN2O: number; settingsChanges: { col: number; fgf: number; carrierGas: string | null; fio2: number; fiAir: number; fiN2O: number }[] } | null = null
  let maxCol = 0

  for (const ev of chrono) {
    const col = tsToCol(ev.ts)
    if (col > maxCol) maxCol = col

    if (ev.type === "vital") {
      while (vitals.length <= col) vitals.push({})
      vitals[col] = {
        systolic: ev.systolic, diastolic: ev.diastolic,
        heartRate: ev.heartRate, spO2: ev.spO2, etco2: ev.etco2, temp: ev.temp, bgl: ev.bgl,
      }
    } else if (ev.type === "drug") {
      // Coded identity (drugId/atcCode/inn) and route now survive into the
      // projection, not just the raw event — previously dropped here.
      drugs.push({ colIdx: col, name: ev.name!, dose: ev.dose!, unit: ev.unit!, drugId: ev.drugId, atcCode: ev.atcCode, inn: ev.inn, route: ev.drugRoute })
    } else if (ev.type === "infusion_start") {
      activeInfMap[ev.infId!] = { startCol: col, ev, initialRate: ev.rate!, rateChanges: [] }
    } else if (ev.type === "infusion_rate" && activeInfMap[ev.infId!]) {
      const entry = activeInfMap[ev.infId!]
      entry.rateChanges = [...(entry.rateChanges ?? []), { col, rate: ev.rate!, unit: ev.unit ?? entry.ev.unit!, concentration: ev.concentration }]
      // Update ev.rate so it reflects the current running rate for display, but
      // initialRate is preserved so BarRow can show the correct rate for the first segment
      entry.ev = { ...entry.ev, rate: ev.rate, concentration: ev.concentration ?? entry.ev.concentration }
    } else if (ev.type === "infusion_stop") {
      const entry = activeInfMap[ev.infId!]
      if (entry) {
        const rateChanges = entry.rateChanges?.length ? entry.rateChanges : undefined
        // Use initialRate (not entry.ev.rate which is the final rate) so BarRow
        // correctly shows the original rate for cells before the first rateChange
        infusions.push({ id: ev.infId!, name: entry.ev.name!, rate: entry.initialRate, unit: entry.ev.unit!, color: entry.ev.color!, startCol: entry.startCol, endCol: col, concentration: entry.ev.concentration, route: entry.ev.drugRoute, drugId: entry.ev.drugId, atcCode: entry.ev.atcCode, inn: entry.ev.inn, rateChanges })
        delete activeInfMap[ev.infId!]
      }
    } else if (ev.type === "fluid_start") {
      activeFluidMap[ev.fluidId!] = { startCol: col, ev }
    } else if (ev.type === "fluid_end") {
      const entry = activeFluidMap[ev.fluidId!]
      if (entry) {
        fluids.push({ id: ev.fluidId!, name: entry.ev.name!, category: entry.ev.category ?? "", volume: entry.ev.volume!, color: entry.ev.color!, startCol: entry.startCol, endCol: col })
        delete activeFluidMap[ev.fluidId!]
      }
    } else if (ev.type === "agent_start") {
      if (agentStart && agentStart.name !== ev.name) {
        agents.push({ name: agentStart.name, color: agentStart.color, startCol: agentStart.col, endCol: col })
      }
      agentStart = { name: ev.name!, color: ev.color!, col }
    } else if (ev.type === "agent_stop" && agentStart) {
      agents.push({ name: agentStart.name, color: agentStart.color, startCol: agentStart.col, endCol: col })
      agentStart = null
    } else if (ev.type === "gas_start") {
      if (activeGas) {
        gasSettings.push({
          id: `gas-${gasSettings.length}`,
          startCol: activeGas.startCol,
          endCol: col,
          fgf: activeGas.fgf,
          carrierGas: activeGas.carrierGas,
          fio2: activeGas.fio2,
          fiAir: activeGas.fiAir,
          fiN2O: activeGas.fiN2O,
          settingsChanges: activeGas.settingsChanges.length ? activeGas.settingsChanges : undefined,
        })
      }
      const fractions = gasFractions(ev.carrierGas, ev.fio2)
      activeGas = {
        startCol: col,
        fgf: ev.fgf ?? 0,
        carrierGas: ev.carrierGas ?? null,
        fio2: fractions.fio2,
        fiAir: ev.fiAir ?? fractions.fiAir,
        fiN2O: ev.fiN2O ?? fractions.fiN2O,
        settingsChanges: [],
      }
    } else if (ev.type === "gas_change" && activeGas) {
      const carrierGas = ev.carrierGas ?? activeGas.carrierGas
      const fractions = gasFractions(carrierGas, ev.fio2 ?? activeGas.fio2)
      activeGas.settingsChanges.push({
        col,
        fgf: ev.fgf ?? activeGas.fgf,
        carrierGas,
        fio2: fractions.fio2,
        fiAir: ev.fiAir ?? fractions.fiAir,
        fiN2O: ev.fiN2O ?? fractions.fiN2O,
      })
    } else if (ev.type === "gas_stop" && activeGas) {
      gasSettings.push({
        id: `gas-${gasSettings.length}`,
        startCol: activeGas.startCol,
        endCol: col,
        fgf: activeGas.fgf,
        carrierGas: activeGas.carrierGas,
        fio2: activeGas.fio2,
        fiAir: activeGas.fiAir,
        fiN2O: activeGas.fiN2O,
        settingsChanges: activeGas.settingsChanges.length ? activeGas.settingsChanges : undefined,
      })
      activeGas = null
    }
  }

  // Open-end bars track the now-marker: extend 1 column past current time (not 12)
  const openEnd = Math.max(maxCol, nowCol) + 1
  for (const [infId, { startCol, ev, initialRate, rateChanges }] of Object.entries(activeInfMap)) {
    const rc = rateChanges?.length ? rateChanges : undefined
    infusions.push({ id: infId, name: ev.name!, rate: initialRate, unit: ev.unit!, color: ev.color!, startCol, endCol: openEnd, concentration: ev.concentration, route: ev.drugRoute, drugId: ev.drugId, atcCode: ev.atcCode, inn: ev.inn, rateChanges: rc })
  }
  for (const [fluidId, { startCol, ev }] of Object.entries(activeFluidMap)) {
    fluids.push({ id: fluidId, name: ev.name!, category: ev.category ?? "", volume: ev.volume!, color: ev.color!, startCol, endCol: openEnd })
  }
  if (agentStart) {
    agents.push({ name: agentStart.name, color: agentStart.color, startCol: agentStart.col, endCol: openEnd })
  }
  if (activeGas) {
    gasSettings.push({
      id: `gas-${gasSettings.length}`,
      startCol: activeGas.startCol,
      endCol: openEnd,
      fgf: activeGas.fgf,
      carrierGas: activeGas.carrierGas,
      fio2: activeGas.fio2,
      fiAir: activeGas.fiAir,
      fiN2O: activeGas.fiN2O,
      settingsChanges: activeGas.settingsChanges.length ? activeGas.settingsChanges : undefined,
    })
  }

  return { vitals, drugs, infusions, fluids, agents, gasSettings }
}

export function eventCol(ev: LogEvent, startTs: Date): number {
  const ms = new Date(ev.ts).getTime() - startTs.getTime()
  return Math.max(0, Math.floor(ms / (5 * 60_000)))
}

export function computeVerticalTimetableWindow(
  log: LogEvent[],
  timetable: TimetableData,
  chartStart: Date,
  now = new Date(),
): {
  currentCol: number
  nowSlotPercent: number
  eventRows: Record<number, LogEvent[]>
  lastEventCol: number
  chartRows: number[]
} {
  const currentCol = Math.max(0, Math.floor((now.getTime() - chartStart.getTime()) / (5 * 60_000)))
  const nowSlotPercent = Math.max(3, Math.min(97, (((now.getTime() - chartStart.getTime()) % (5 * 60_000)) / (5 * 60_000)) * 100))
  const eventRows = log.reduce<Record<number, LogEvent[]>>((acc, ev) => {
    const col = eventCol(ev, chartStart)
    if (!acc[col]) acc[col] = []
    acc[col].push(ev)
    return acc
  }, {})
  const lastEventCol = Math.max(0, ...log.map(ev => eventCol(ev, chartStart)))
  const maxProjectedCol = Math.max(
    currentCol + 6,
    lastEventCol + 6,
    ...timetable.infusions.map(infusion => infusion.endCol + 1),
    ...timetable.fluids.map(fluid => fluid.endCol + 1),
    ...timetable.agents.map(agent => agent.endCol + 1),
  )
  const chartRows = Array.from({ length: Math.max(12, maxProjectedCol + 1) }, (_, col) => col)
  return { currentCol, nowSlotPercent, eventRows, lastEventCol, chartRows }
}

export function loadedTimetableStateFromLog(log: LogEvent[], now = new Date()): {
  startDate: Date | null
  elapsedMs: number
  timetable: TimetableData | null
  columnCount: number
} {
  if (log.length === 0) {
    return { startDate: null, elapsedMs: 0, timetable: null, columnCount: 12 }
  }
  const startDate = new Date(log[log.length - 1].ts)
  const roundedStart = roundDown5Min(startDate)
  return {
    startDate,
    elapsedMs: now.getTime() - startDate.getTime(),
    timetable: eventsToTimetable(log, roundedStart, now),
    columnCount: Math.max(12, Math.ceil((now.getTime() - roundedStart.getTime()) / (5 * 60_000)) + 12),
  }
}

export function timeAtCol(startTs: Date, col: number): Date {
  return new Date(startTs.getTime() + col * 5 * 60_000)
}

export function formatDateHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function hhmmFromStoredTime(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  if (/^\d{2}:\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
}

export function caseDateForHHMM(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number)
  const d = new Date()
  d.setHours(h || 0, m || 0, 0, 0)
  if (d.getTime() - Date.now() > 5 * 60_000) d.setDate(d.getDate() - 1)
  return d
}

export function eventTimeForCol(startTs: Date, col: unknown): string {
  const n = typeof col === "number" && Number.isFinite(col) ? col : 0
  return timeAtCol(startTs, Math.max(0, n)).toISOString()
}

export function numOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

export function hasAnyValue(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.some(key => value[key] != null && value[key] !== "")
}

// Inverse of eventsToTimetable: convert a web-shaped timetable edit back into
// log events (newest-first), so web-side changes merge into the mobile log.
export function webTimetableToLog(kev: any, startTs: Date): LogEvent[] {
  const events: LogEvent[] = []
  const push = (event: Omit<LogEvent, "id">, stableId: string) => {
    events.push({ id: stableId, ...event })
  }

  if (Array.isArray(kev?.vitals)) {
    kev.vitals.forEach((row: unknown, col: number) => {
      if (!row || typeof row !== "object") return
      const vital = row as Record<string, unknown>
      if (!hasAnyValue(vital, ["systolic", "diastolic", "heartRate", "spO2", "etco2", "temp", "bgl"])) return
      push({
        type: "vital",
        ts: eventTimeForCol(startTs, col),
        systolic: numOrUndefined(vital.systolic),
        diastolic: numOrUndefined(vital.diastolic),
        heartRate: numOrUndefined(vital.heartRate),
        spO2: numOrUndefined(vital.spO2),
        etco2: numOrUndefined(vital.etco2),
        temp: numOrUndefined(vital.temp),
        bgl: numOrUndefined(vital.bgl),
      }, `web-vital-${col}`)
    })
  }

  if (Array.isArray(kev?.drugs)) {
    kev.drugs.forEach((drug: any, index: number) => {
      if (!drug?.name) return
      push({
        type: "drug",
        ts: eventTimeForCol(startTs, drug.colIdx),
        name: String(drug.name),
        dose: drug.dose != null ? String(drug.dose) : undefined,
        unit: drug.unit != null ? String(drug.unit) : undefined,
        drugId: drug.drugId,
        atcCode: drug.atcCode,
        inn: drug.inn,
        drugRoute: drug.route,
      }, `web-drug-${index}`)
    })
  }

  if (Array.isArray(kev?.infusions)) {
    kev.infusions.forEach((inf: any, index: number) => {
      const infId = String(inf?.id ?? `web-inf-${index}`)
      if (!inf?.name) return
      const common = {
        name: String(inf.name),
        unit: inf.unit != null ? String(inf.unit) : undefined,
        color: inf.color ?? "#64748b",
        infId,
        concentration: inf.concentration,
        drugRoute: inf.route,
        drugId: inf.drugId,
        atcCode: inf.atcCode,
        inn: inf.inn,
      }
      push({ type: "infusion_start", ts: eventTimeForCol(startTs, inf.startCol), rate: inf.rate != null ? String(inf.rate) : undefined, ...common }, `web-inf-start-${infId}`)
      if (Array.isArray(inf.rateChanges)) {
        inf.rateChanges.forEach((change: any, changeIndex: number) => {
          push({
            type: "infusion_rate",
            ts: eventTimeForCol(startTs, change.col),
            rate: change.rate != null ? String(change.rate) : undefined,
            unit: change.unit != null ? String(change.unit) : common.unit,
            concentration: change.concentration,
            infId,
          }, `web-inf-rate-${infId}-${changeIndex}`)
        })
      }
      if (inf.stopped) push({ type: "infusion_stop", ts: eventTimeForCol(startTs, inf.endCol), infId }, `web-inf-stop-${infId}`)
    })
  }

  if (Array.isArray(kev?.fluids)) {
    kev.fluids.forEach((fluid: any, index: number) => {
      const fluidId = String(fluid?.id ?? `web-fluid-${index}`)
      if (!fluid?.name) return
      push({
        type: "fluid_start",
        ts: eventTimeForCol(startTs, fluid.startCol),
        fluidId,
        name: String(fluid.name),
        category: fluid.category ?? "",
        volume: fluid.volume != null ? String(fluid.volume) : undefined,
        color: fluid.color ?? "#38bdf8",
      }, `web-fluid-start-${fluidId}`)
      if (fluid.stopped) push({ type: "fluid_end", ts: eventTimeForCol(startTs, fluid.endCol), fluidId }, `web-fluid-end-${fluidId}`)
    })
  }

  if (Array.isArray(kev?.agents)) {
    kev.agents.forEach((agent: any, index: number) => {
      if (!agent?.name) return
      push({
        type: "agent_start",
        ts: eventTimeForCol(startTs, agent.startCol),
        name: String(agent.name),
        color: agent.color ?? "#a855f7",
        value: agent.percent != null ? String(agent.percent) : undefined,
      }, `web-agent-start-${index}`)
      if (agent.stopped) push({ type: "agent_stop", ts: eventTimeForCol(startTs, agent.endCol), name: String(agent.name) }, `web-agent-stop-${index}`)
    })
  }

  if (Array.isArray(kev?.clinicalEvents)) {
    kev.clinicalEvents.forEach((event: any, index: number) => {
      if (!event?.label) return
      push({
        type: "clinical_event",
        ts: eventTimeForCol(startTs, event.colIdx),
        label: String(event.label),
        color: event.color ?? "#94a3b8",
      }, `web-clinical-${index}`)
    })
  }

  if (Array.isArray(kev?.gasSettings)) {
    kev.gasSettings.forEach((gas: any, index: number) => {
      const gasId = `web-gas-${index}`
      push({
        type: "gas_start",
        ts: eventTimeForCol(startTs, gas.startCol),
        fgf: numOrUndefined(gas.fgf) ?? 0,
        carrierGas: gas.carrierGas ?? null,
        fio2: numOrUndefined(gas.fio2) ?? 21,
        fiAir: numOrUndefined(gas.fiAir),
        fiN2O: numOrUndefined(gas.fiN2O),
      }, `${gasId}-start`)
      if (Array.isArray(gas.settingsChanges)) {
        gas.settingsChanges.forEach((change: any, changeIndex: number) => {
          push({
            type: "gas_change",
            ts: eventTimeForCol(startTs, change.col),
            fgf: numOrUndefined(change.fgf) ?? 0,
            carrierGas: change.carrierGas ?? null,
            fio2: numOrUndefined(change.fio2) ?? 21,
            fiAir: numOrUndefined(change.fiAir),
            fiN2O: numOrUndefined(change.fiN2O),
          }, `${gasId}-change-${changeIndex}`)
        })
      }
      if (gas.stopped) push({ type: "gas_stop", ts: eventTimeForCol(startTs, gas.endCol) }, `${gasId}-stop`)
    })
  }

  return events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
}

export function roundDown5Min(d: Date): Date {
  const m = new Date(d)
  m.setSeconds(0, 0)
  m.setMinutes(Math.floor(m.getMinutes() / 5) * 5)
  return m
}

export function safeTimetableScrollIndex(targetCol: number, rowCount: number): number {
  return Math.min(targetCol, rowCount - 1)
}

export function timetableTabInitialScrollTarget(
  lastEventCol: number,
  currentCol: number,
  rowCount: number,
): number {
  const target = lastEventCol < currentCol - 6
    ? Math.min(lastEventCol + 3, rowCount - 1)
    : Math.min(currentCol, rowCount - 1)
  return target
}
