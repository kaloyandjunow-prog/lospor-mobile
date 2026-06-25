import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, Modal,
  TextInput, Alert, Pressable, KeyboardAvoidingView, Platform, Switch,
  unstable_batchedUpdates, PanResponder, useWindowDimensions,
} from "react-native"
import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import * as Haptics from "expo-haptics"
import * as SecureStore from "expo-secure-store"
import { apiFetch, apiJson } from "@/lib/api"
import { markPendingIntraopCase } from "@/lib/pending-intraop-events"
import { saveCasePatchWithQueue } from "@/lib/offline-case-patches"
import { useCaseReminders } from "@/lib/use-case-reminders"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"
import { useCaseLiveUpdates } from "@/lib/use-case-live-updates"
import { IntraopTimetable, emptyTimetable, type TimetableData, type VitalsEntry } from "@/components/IntraopTimetable"
import { SyncBadge } from "@/components/clinical-ui"
import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { colors } from "@/theme/colors"
import { useCaseLock } from "@/lib/use-case-lock"
import { WatchingOverlay } from "@/components/WatchingOverlay"
import { useOptionLibrary, type LibraryOption } from "@/lib/use-option-library"
import { buildVascTree, VASC_PREEXISTING_QUICK, vascDefaultUnit, vascSiteColor, type VascTreeNode } from "@/lib/vascular-access-tree"
import { Sheet } from "@/components/intraop/Sheet"
import { ActionTile } from "@/components/intraop/ActionTile"
import { AgentSheet } from "@/components/intraop/AgentSheet"
import { useAgentEntry } from "@/lib/use-agent-entry"
import { useGasSettingsEntry } from "@/lib/use-gas-settings-entry"
import { FluidSheet } from "@/components/intraop/FluidSheet"
import { FluidEndSheet } from "@/components/intraop/FluidEndSheet"
import { useFluidEntry } from "@/lib/use-fluid-entry"
import { InfusionSheet } from "@/components/intraop/InfusionSheet"
import { InfusionActionSheet } from "@/components/intraop/InfusionActionSheet"
import { useInfusionEntry } from "@/lib/use-infusion-entry"
import { DrugSheet } from "@/components/intraop/DrugSheet"
import { useDrugEntry } from "@/lib/use-drug-entry"
import { useVitalsEntry } from "@/lib/use-vitals-entry"
import { PositionTab } from "@/components/intraop/tabs/PositionTab"
import { MonitoringTab } from "@/components/intraop/tabs/MonitoringTab"
import { PremedicationTab } from "@/components/intraop/tabs/PremedicationTab"
import { EquipmentTab } from "@/components/intraop/tabs/EquipmentTab"
import { TimingTab } from "@/components/intraop/tabs/TimingTab"
import { TechniqueTab } from "@/components/intraop/tabs/TechniqueTab"
import { VascularTab } from "@/components/intraop/tabs/VascularTab"
import { CL_GRADES, AIRWAY_HAS_SUBOPTIONS, VENT_ASSISTED, VENT_CONTROLLED } from "@/lib/airway-ventilation"
import { AirwayTab } from "@/components/intraop/tabs/AirwayTab"
import { uid } from "@/lib/intraop-log-event"
import type { EventType, LogEvent, ActiveInfusion, ActiveFluid, ActiveGasSettings } from "@/lib/intraop-log-event"
import { VitalStepper } from "@/components/VitalStepper"

// react-native-web does NOT export `unstable_batchedUpdates` (it's undefined there),
// so calling it directly throws "is not a function" and aborts the whole case load
// on the PWA. React 18+ auto-batches async setState anyway, so the fallback simply
// runs the updates directly on web while preserving explicit batching on native.
const runBatched: (fn: () => void) => void =
  typeof unstable_batchedUpdates === "function" ? unstable_batchedUpdates : (fn) => fn()

// ─── Types ────────────────────────────────────────────────────────────────────

type AirwayDetail  = { tubeSize: string; cuffed: "yes"|"no"|""; tool: string; cl: string }
type RunningItem   = { id: string; label: string; color: string }

// ─── Data ─────────────────────────────────────────────────────────────────────

const COMPLICATION_TC_TITLES: Record<string, ClinicalStringKey> = {
  cardiovascular: "compCatCardiovascular",
  respiratory:    "compCatRespiratory",
  neurological:   "compCatNeurological",
  metabolic:      "compCatMetabolic",
  drug:           "compCatDrug",
  haematological: "compCatHaematological",
  equipment:      "compCatEquipment",
  surgical:       "compCatSurgical",
}

const COMPLICATION_GROUPS = [
  {
    id: "cardiovascular",
    title: "Cardiovascular",
    items: [
      "Hypotension", "Hypertension", "Bradycardia", "Tachycardia",
      "Atrial fibrillation", "Supraventricular arrhythmia", "Ventricular tachycardia",
      "Ventricular fibrillation", "Myocardial ischaemia", "Myocardial infarction",
      "Cardiac arrest", "Venous air embolism", "Pulmonary embolism", "ST changes",
    ],
  },
  {
    id: "respiratory",
    title: "Respiratory",
    items: [
      "Hypoxia / desaturation", "Laryngospasm", "Bronchospasm", "Aspiration",
      "Difficult intubation", "Failed intubation", "CICO (can't intubate can't oxygenate)",
      "Accidental extubation", "Endobronchial intubation",
      "Pneumothorax", "Tension pneumothorax", "Hypercarbia",
    ],
  },
  {
    id: "neurological",
    title: "Neurological",
    items: [
      "Awareness under anaesthesia", "Cerebrovascular accident / stroke",
      "Raised intracranial pressure", "Peripheral nerve injury",
      "Spinal cord ischaemia", "Total spinal",
      "Delayed emergence", "Seizure", "High spinal", "Failed block",
    ],
  },
  {
    id: "metabolic",
    title: "Metabolic / Temperature",
    items: [
      "Hypothermia", "Hyperthermia", "Malignant hyperthermia",
      "Hypoglycaemia", "Hyperglycaemia",
      "Hyponatraemia", "Hypernatraemia", "Hypokalaemia", "Hyperkalaemia",
      "Hypocalcaemia", "Adrenal crisis",
    ],
  },
  {
    id: "drug",
    title: "Drug / Pharmacological",
    items: [
      "Anaphylaxis / allergic reaction", "Anaphylactoid reaction", "Drug reaction", "Latex reaction",
      "Drug error", "Drug overdose",
      "Local anaesthetic systemic toxicity (LAST)",
      "Residual neuromuscular blockade", "Serotonin syndrome",
    ],
  },
  {
    id: "haematological",
    title: "Haematological",
    items: [
      "Massive haemorrhage", "Blood loss >1L", "Coagulopathy",
      "DIC (disseminated intravascular coagulation)",
      "Haemolytic transfusion reaction", "Febrile non-haemolytic transfusion reaction",
      "TRALI (transfusion-related acute lung injury)",
      "TACO (transfusion-associated circulatory overload)",
    ],
  },
  {
    id: "equipment",
    title: "Equipment / Technical",
    items: [
      "IV line failure / extravasation", "Arterial line failure", "CVK failure",
      "ETT displacement", "Circuit disconnection", "Gas supply failure",
      "Monitoring failure", "Regional block failure", "Equipment malfunction",
    ],
  },
  {
    id: "surgical",
    title: "Surgical",
    items: [
      "Unexpected major haemorrhage", "Injury to major vessel", "Injury to organ",
      "Tourniquet complication", "Pneumoperitoneum complication",
      "Positioning injury", "Compartment syndrome", "Venous gas embolism",
    ],
  },
]

const PREMED_QUICK = [
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

// Populated in place from the OptionLibrary API (see hook calls + useMemo
// blocks inside IntraopLiveScreen, below) instead of hardcoded here. This is
// also where this screen's lists used to drift from the IntraopTimetable
// widget's own copies — both now read the same rows.
const MOBILE_DRUG_CAT_COLOR: Record<string, string> = {
  "Induction": "#3b82f6", "Opioids": "#a855f7", "Relaxants": "#f59e0b", "Reversal": "#10b981",
  "Vasopressors": "#ef4444", "Antiemetics": "#14b8a6", "Analgesics": "#f97316", "Local anaesthetics": "#0891b2",
}
// Dose/rate presets used to be hardcoded here (DOSE_PRESETS/INF_RATE_PRESETS)
// — now sourced from OptionLibrary metadata via DRUG_QUICK_DOSES/
// INFUSION_QUICK_RATES below, same single source of truth web uses.

const MOBILE_FLUID_CAT_COLOR: Record<string, string> = {
  "Crystalloids": "#06b6d4", "Colloids": "#818cf8", "Blood products": "#fb7185", "Other": "#94a3b8",
}
const MOBILE_AGENT_COLOR: Record<string, string> = { Sevoflurane: "#a855f7", Desflurane: "#3b82f6", Isoflurane: "#10b981" }

type ClinicalEventDef = { label: string; color: string }

const MOBILE_POSITION_COLOR: Record<string, string> = {
  SUPINE: "#3b82f6", PRONE: "#6366f1", LEFT_LATERAL: "#06b6d4", RIGHT_LATERAL: "#06b6d4",
  GYNECOLOGICAL: "#a855f7", TRENDELENBURG: "#f97316", REVERSE_TRENDELENBURG: "#f59e0b",
  FOWLER: "#22c55e", BEACH_CHAIR: "#14b8a6", LLOYD_DAVIES: "#8b5cf6",
  LATERAL_DECUBITUS_LEFT: "#0ea5e9", LATERAL_DECUBITUS_RIGHT: "#0ea5e9",
  SITTING: "#22c55e", JACKKNIFE: "#64748b", KNEE_CHEST: "#64748b",
}
type TechniqueNode = { v: string; label: string; isOther?: boolean; children?: TechniqueNode[] }

// Populated in place from the OptionLibrary TECHNIQUE category (web's value
// codes — unifies a real mobile/web code mismatch that existed here before,
// e.g. mobile's old "GENERAL_COMBINED"/"COMBINED_SPINAL_EPIDURAL" vs web's
// "GENERAL_BALANCED"/"CSE" for the same techniques).
function buildTechniqueTree(rows: LibraryOption[]): TechniqueNode[] {
  const byParent = new Map<string | null, LibraryOption[]>()
  for (const r of rows) {
    const key = r.parentId
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(r)
  }
  function build(parentId: string | null): TechniqueNode[] {
    return (byParent.get(parentId) ?? []).map(r => ({
      v: r.value,
      label: r.label,
      children: byParent.has(r.id) ? build(r.id) : undefined,
    }))
  }
  return build(null)
}

function techniqueColor(v: string): string {
  if (v.startsWith("GENERAL"))  return "#8b5cf6"
  if (v.startsWith("SPINAL") || v.startsWith("EPIDURAL") || v.startsWith("CSE") || v === "DPE") return "#3b82f6"
  if (v.startsWith("BLOCK"))    return "#22c55e"
  if (v.startsWith("SEDATION")) return "#f59e0b"
  if (v === "LOCAL")            return "#f43f5e"
  return "#64748b"
}

// Grouping nodes that add no clinical value in a compact pill label
const TECH_SKIP_LABELS = new Set([
  "Peripheral nerve block", "Upper extremity", "Lower extremity",
  "Trunk / Abdominal wall", "Head & Neck", "Ophthalmic", "Single shot",
])
const TECH_ROOT_SHORT: Record<string, string> = {
  "General anaesthesia": "General",
  "Regional anaesthesia": "Regional",
  "Sedation / MAC": "Sedation",
  "Local infiltration": "Local infiltration",
}

const TECHNIQUE_FAVORITES: Record<string, string[]> = {
  "GENERAL_INHALATION": ["Propofol","Fentanyl","Rocuronium","Sugammadex","Ondansetron"],
  "GENERAL_TIVA":       ["Propofol","Remifentanil","Fentanyl","Sugammadex"],
  "GENERAL_COMBINED":   ["Propofol","Fentanyl","Rocuronium","Sugammadex"],
  "SPINAL_SINGLE_LUMBAR":       ["Bupivacaine","Fentanyl","Ephedrine","Ondansetron"],
  "SPINAL_SINGLE_LOW_THORACIC": ["Bupivacaine","Fentanyl","Ephedrine","Ondansetron"],
  "EPIDURAL_LUMBAR":    ["Bupivacaine","Ropivacaine","Fentanyl","Ephedrine"],
  "CSE_LUMBAR":         ["Bupivacaine","Fentanyl","Ephedrine"],
  "SEDATION_CONSCIOUS": ["Midazolam","Propofol","Fentanyl","Ketamine"],
  "SEDATION_MAC":       ["Propofol","Ketamine","Midazolam"],
}

type VascularEntry = { id: string; site: string; siteLabel: string; size: string; sizeUnit: string; depthCm: string; lumens?: string; preexisting?: boolean }

type PremDrug = { name: string; dose: number; unit: string; min: number; max: number; step: number; routes: string[]; defaultRoute: string; hint: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────



function formatTs(ts: string): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}

function fmtElapsed(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function trendArrow(cur?: number, prev?: number): string {
  if (cur == null || prev == null || Math.abs(cur - prev) < 5) return ""
  return cur > prev ? " ↑" : " ↓"
}

// eventLabel moved inside IntraopLiveScreen below — it depends on
// drugColor/clinicalEventColor, which read library-derived local data.

// ─── Events → timetable projection ───────────────────────────────────────────

function eventsToTimetable(log: LogEvent[], startTs: Date, now?: Date): TimetableData {
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

function eventCol(ev: LogEvent, startTs: Date): number {
  const ms = new Date(ev.ts).getTime() - startTs.getTime()
  return Math.max(0, Math.floor(ms / (5 * 60_000)))
}

function timeAtCol(startTs: Date, col: number): Date {
  return new Date(startTs.getTime() + col * 5 * 60_000)
}

function formatDateHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}

function hhmmFromStoredTime(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  if (/^\d{2}:\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`
}

function caseDateForHHMM(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number)
  const d = new Date()
  d.setHours(h || 0, m || 0, 0, 0)
  if (d.getTime() - Date.now() > 5 * 60_000) d.setDate(d.getDate() - 1)
  return d
}

function eventTimeForCol(startTs: Date, col: unknown): string {
  const n = typeof col === "number" && Number.isFinite(col) ? col : 0
  return timeAtCol(startTs, Math.max(0, n)).toISOString()
}

function numOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function hasAnyValue(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.some(key => value[key] != null && value[key] !== "")
}

function webTimetableToLog(kev: any, startTs: Date): LogEvent[] {
  const events: LogEvent[] = []
  const push = (event: Omit<LogEvent, "id">, stableId: string) => {
    events.push({ id: stableId, ...event })
  }

  if (Array.isArray(kev?.vitals)) {
    kev.vitals.forEach((row: unknown, col: number) => {
      if (!row || typeof row !== "object") return
      const vital = row as Record<string, unknown>
      if (!hasAnyValue(vital, ["systolic","diastolic","heartRate","spO2","etco2","temp","bgl"])) return
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

function roundDown5Min(d: Date): Date {
  const m = new Date(d)
  m.setSeconds(0, 0)
  m.setMinutes(Math.floor(m.getMinutes() / 5) * 5)
  return m
}

function pendingKey(caseId: string) {
  return `lospor_pending_intraop_${caseId}`
}

function eventForServer(ev: LogEvent): LogEvent {
  const { syncStatus, ...clean } = ev
  return clean
}

async function loadPendingEvents(caseId: string): Promise<LogEvent[]> {
  const raw = await SecureStore.getItemAsync(pendingKey(caseId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function storePendingEvents(caseId: string, events: LogEvent[]) {
  if (events.length === 0) {
    await SecureStore.deleteItemAsync(pendingKey(caseId))
    // Keep the shared index in sync so the global flusher stops tracking this case.
    await markPendingIntraopCase(caseId, false)
    return
  }
  await SecureStore.setItemAsync(pendingKey(caseId), JSON.stringify(events))
  await markPendingIntraopCase(caseId, true)
}

function mergeLogWithPending(serverLog: LogEvent[], pending: LogEvent[]): LogEvent[] {
  const seen = new Set<string>()
  return [...pending, ...serverLog]
    .filter(ev => {
      if (seen.has(ev.id)) return false
      seen.add(ev.id)
      return true
    })
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
}

// ─── Sheet ────────────────────────────────────────────────────────────────────


// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function IntraopLiveScreen() {
  const { options: drugLibOpts } = useOptionLibrary("INTRAOP_DRUG")
  const { options: infusionLibOpts } = useOptionLibrary("INTRAOP_INFUSION")
  const { options: fluidLibOpts } = useOptionLibrary("INTRAOP_FLUID")
  const { options: agentLibOpts } = useOptionLibrary("INHALATIONAL_AGENT")
  const { options: eventLibOpts } = useOptionLibrary("INTRAOP_EVENT")
  const { options: positionLibOpts } = useOptionLibrary("POSITION")

  const DRUG_CATS = useMemo(() => {
    const byGroup = new Map<string, { cat: string; color: string; drugs: { name: string; unit: string }[] }>()
    for (const o of drugLibOpts) {
      const cat = o.group ?? "Other"
      if (!byGroup.has(cat)) byGroup.set(cat, { cat, color: MOBILE_DRUG_CAT_COLOR[cat] ?? "#64748b", drugs: [] })
      byGroup.get(cat)!.drugs.push({ name: o.label, unit: o.metadata?.defaultUnit ?? "mg" })
    }
    return [...byGroup.values()]
  }, [drugLibOpts])

  function drugColor(name: string): string {
    for (const cat of DRUG_CATS) {
      if (cat.drugs.some(d => d.name === name)) return cat.color
    }
    return "#64748b"
  }

  const INF_DRUGS = useMemo(() =>
    infusionLibOpts.map((o: LibraryOption) => ({ name: o.label, unit: o.metadata?.defaultUnit ?? "mcg/kg/min", color: o.color ?? "#64748b" })),
  [infusionLibOpts])

  const FLUID_LIST = useMemo(() =>
    fluidLibOpts.map((o: LibraryOption) => ({ name: o.label, cat: o.group ?? "Other", color: MOBILE_FLUID_CAT_COLOR[o.group ?? "Other"] ?? "#94a3b8" })),
  [fluidLibOpts])
  const FLUID_QUICK_VOLUMES = useMemo(() => {
    const m: Record<string, number[]> = {}
    for (const o of fluidLibOpts) if (o.metadata?.quickValues?.length) m[o.label] = o.metadata.quickValues
    return m
  }, [fluidLibOpts])

  const VOLATILE_AGENTS = useMemo(() =>
    agentLibOpts.map((o: LibraryOption) => ({ name: o.label, color: MOBILE_AGENT_COLOR[o.label] ?? "#a855f7" })),
  [agentLibOpts])

  // Dose presets, routes, and LA concentration options now read from the
  // same OptionLibrary metadata web uses — single source of truth instead of
  // the hardcoded DOSE_PRESETS/INF_RATE_PRESETS literals this used to carry.
  const DRUG_QUICK_DOSES = useMemo(() => {
    const m: Record<string, number[]> = {}
    for (const o of drugLibOpts) if (o.metadata?.quickValues?.length) m[o.label] = o.metadata.quickValues
    return m
  }, [drugLibOpts])
  const DRUG_ROUTES = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const o of drugLibOpts) m[o.label] = o.metadata?.routes ?? ["IV"]
    return m
  }, [drugLibOpts])
  const DRUG_LA_CONCENTRATIONS = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const o of drugLibOpts) if (o.metadata?.concentrationOptions?.length) m[o.label] = o.metadata.concentrationOptions
    return m
  }, [drugLibOpts])
  // Stepper/slider range per drug — falls back to a sensible default by unit
  // when the canonical library hasn't been filled in for that drug yet
  // (matches web's bolusRange() fallback).
  const DRUG_RANGES = useMemo(() => {
    const m: Record<string, { min: number; max: number; step: number }> = {}
    for (const o of drugLibOpts) if (o.metadata?.min != null && o.metadata?.max != null && o.metadata?.step != null) m[o.label] = { min: o.metadata.min, max: o.metadata.max, step: o.metadata.step }
    return m
  }, [drugLibOpts])
  function drugRange(name: string, unit: string) {
    if (DRUG_RANGES[name]) return DRUG_RANGES[name]
    if (unit === "mcg") return { min: 0, max: 2000, step: 10 }
    if (unit === "g")   return { min: 0, max: 10,   step: 0.5 }
    if (unit === "ml")  return { min: 0, max: 100,  step: 1 }
    if (unit === "IU")  return { min: 0, max: 200,  step: 5 }
    return { min: 0, max: 500, step: 5 }
  }
  const INFUSION_QUICK_RATES = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const o of infusionLibOpts) if (o.metadata?.quickValues?.length) m[o.label] = o.metadata.quickValues.map(String)
    return m
  }, [infusionLibOpts])
  const INFUSION_ROUTES = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const o of infusionLibOpts) m[o.label] = o.metadata?.routes ?? ["IV"]
    return m
  }, [infusionLibOpts])
  const INFUSION_LA_CONCENTRATIONS = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const o of infusionLibOpts) if (o.metadata?.concentrationOptions) m[o.label] = o.metadata.concentrationOptions
    return m
  }, [infusionLibOpts])
  // Default 0-100 step 1 mirrors web's DEFAULT_INF fallback for drugs not yet
  // in the canonical library.
  const INFUSION_RANGES = useMemo(() => {
    const m: Record<string, { min: number; max: number; step: number }> = {}
    for (const o of infusionLibOpts) m[o.label] = { min: o.metadata?.min ?? 0, max: o.metadata?.max ?? 100, step: o.metadata?.step ?? 1 }
    return m
  }, [infusionLibOpts])
  function infusionRange(name: string) {
    return INFUSION_RANGES[name] ?? { min: 0, max: 100, step: 1 }
  }
  // Coded identity by name — empty today (catalog isn't populated yet), but
  // wired so it flows through to the saved event once it is, instead of
  // being silently dropped.
  const DRUG_CODES = useMemo(() => {
    const m: Record<string, { drugId?: string; atcCode?: string; inn?: string }> = {}
    for (const o of drugLibOpts) m[o.label] = { drugId: o.drugId ?? undefined, atcCode: o.atcCode ?? undefined, inn: o.inn ?? undefined }
    return m
  }, [drugLibOpts])
  const INFUSION_CODES = useMemo(() => {
    const m: Record<string, { drugId?: string; atcCode?: string; inn?: string }> = {}
    for (const o of infusionLibOpts) m[o.label] = { drugId: o.drugId ?? undefined, atcCode: o.atcCode ?? undefined, inn: o.inn ?? undefined }
    return m
  }, [infusionLibOpts])
  const AGENT_QUICK_PERCENTS = useMemo(() => {
    const m: Record<string, number[]> = {}
    for (const o of agentLibOpts) if (o.metadata?.quickValues?.length) m[o.label] = o.metadata.quickValues
    return m
  }, [agentLibOpts])

  const CLINICAL_EVENT_CATS = useMemo(() => {
    const byGroup = new Map<string, { cat: string; color: string; isComplication?: boolean; events: ClinicalEventDef[] }>()
    for (const o of eventLibOpts) {
      const cat = o.group ?? "Other"
      if (!byGroup.has(cat)) byGroup.set(cat, { cat, color: o.metadata?.categoryColor ?? "#64748b", isComplication: !!o.metadata?.isComplication, events: [] })
      byGroup.get(cat)!.events.push({ label: o.label, color: o.color ?? "#64748b" })
    }
    return [...byGroup.values()]
  }, [eventLibOpts])

  function clinicalEventColor(label: string): string {
    for (const cat of CLINICAL_EVENT_CATS) {
      const ev = cat.events.find(e => label === e.label || label.startsWith(e.label + " (") || label.startsWith(e.label))
      if (ev) return ev.color
    }
    return "#64748b"
  }

  function eventLabel(ev: LogEvent, prevVital?: LogEvent): { text: string; color: string; sub?: string } {
    switch (ev.type) {
      case "drug":
        return { text: `${ev.name} ${ev.dose} ${ev.unit}`, color: ev.color ?? drugColor(ev.name ?? ""), sub: ev.category }
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
        return { text: ev.label ?? "", color: clinicalEventColor(ev.label?.split(" (")[0] ?? "") }
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

  const POSITIONS_LIST = useMemo(() =>
    positionLibOpts.map((o: LibraryOption) => ({ code: o.value, label: o.label, desc: o.description ?? "", color: MOBILE_POSITION_COLOR[o.value] ?? "#64748b" })),
  [positionLibOpts])

  const { options: monitoringLibOpts } = useOptionLibrary("MONITORING")
  const MONITORING_OPTS = useMemo(() =>
    monitoringLibOpts.map((o: LibraryOption) => ({ label: o.label, field: o.value, section: o.group ?? "other" })),
  [monitoringLibOpts])

  const { options: techniqueLibOpts } = useOptionLibrary("TECHNIQUE")
  const TECHNIQUE_TREE = useMemo(() => buildTechniqueTree(techniqueLibOpts), [techniqueLibOpts])

  const { options: vascularLibOpts } = useOptionLibrary("VASCULAR_ACCESS")
  const VASC_TREE = useMemo(() => buildVascTree(vascularLibOpts), [vascularLibOpts])

  function techValuePath(v: string, nodes: TechniqueNode[] = TECHNIQUE_TREE, trail: string[] = []): string[] | undefined {
    for (const n of nodes) {
      const next = [...trail, n.label]
      if (n.v === v) return next
      if (n.children) { const f = techValuePath(v, n.children, next); if (f) return f }
    }
  }

  // Category-aware label: e.g. "General Inhalational", "Regional Femoral nerve",
  // "Regional Neuraxial Epidural Lumbar". Mirrors the web display.
  function techniqueLabel(v: string): string {
    if (v.startsWith("OTHER:")) return v.slice(6)
    const path = techValuePath(v)
    if (!path || path.length === 0) return v
    const parts = path
      .map((label, i) => (i === 0 ? (TECH_ROOT_SHORT[label] ?? label) : label))
      .filter(label => !TECH_SKIP_LABELS.has(label))
      .map(label => label.replace(" (SAB)", ""))
    // Drop consecutive duplicates
    const out: string[] = []
    for (const p of parts) if (out[out.length - 1] !== p) out.push(p)
    return out.join(" ")
  }

  const { options: airwayLibOpts } = useOptionLibrary("AIRWAY_MANAGEMENT")
  const AIRWAY_TOOLS = useMemo(() =>
    airwayLibOpts.filter((o: LibraryOption) => o.group === "Instrument").map((o: LibraryOption) => ({ code: o.value, label: o.label })),
  [airwayLibOpts])
  const AIRWAY_DEVICES = useMemo(() =>
    airwayLibOpts.filter((o: LibraryOption) => o.group === "Device").map((o: LibraryOption) => ({ code: o.value, label: o.label })),
  [airwayLibOpts])

  const { options: premedLibOpts } = useOptionLibrary("PREMED_DRUG")
  const PREMED_LIBRARY = useMemo(() => {
    const byGroup = new Map<string, { category: string; drugs: PremDrug[] }>()
    for (const o of premedLibOpts) {
      const cat = o.group ?? "Other"
      if (!byGroup.has(cat)) byGroup.set(cat, { category: cat, drugs: [] })
      const m = o.metadata ?? {}
      byGroup.get(cat)!.drugs.push({ name: o.label, dose: m.dose ?? 1, unit: m.unit ?? "mg", min: m.min ?? 0, max: m.max ?? 100, step: m.step ?? 1, routes: m.routes ?? ["PO"], defaultRoute: m.defaultRoute ?? "PO", hint: m.hint ?? "" })
    }
    return [...byGroup.values()]
  }, [premedLibOpts])

  const { id } = useLocalSearchParams<{ id: string }>()
  const router  = useRouter()
  const { isWatching, takeover } = useCaseLock(id, true)
  const { tc, etco2Unit, temperatureUnit } = usePreferences()

  const [caseInfo, setCaseInfo] = useState<{
    caseCode: string; procedure?: string; diagnosis?: string; techniques?: string[]
    status?: string; finalizedAt?: string | null
  } | null>(null)

  const [log,             setLog]             = useState<LogEvent[]>([])
  const logRef = useRef<LogEvent[]>([])
  const legacyWebLogNeedsSyncRef = useRef(false)
  const baseIntraopUpdatedAtRef = useRef<string | null>(null)
  const [activeInfusions, setActiveInfusions] = useState<ActiveInfusion[]>([])
  const [activeFluids,    setActiveFluids]    = useState<ActiveFluid[]>([])
  const [activeAgent,     setActiveAgent]     = useState<{ name: string; color: string; percent?: number } | null>(null)
  const [activeGas,       setActiveGas]       = useState<ActiveGasSettings>(null)

  const { width: screenWidth } = useWindowDimensions()
  const tabRailRef  = useRef<ScrollView>(null)
  const tabLayouts  = useRef<Partial<Record<string, { x: number; width: number }>>>({})

  const [tab,       setTab]       = useState<"equipment"|"technique"|"timing"|"position"|"monitoring"|"airway"|"vascular"|"premedication"|"log"|"events">("equipment")
  const [elapsedMs, setElapsedMs] = useState(0)
  const [caseLoaded, setCaseLoaded] = useState(false)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const startRef                  = useRef<Date | null>(null)
  const verticalTimetableRef      = useRef<FlatList<number>>(null)
  const prevCurrentColRef         = useRef(-1)
  const [entryTs, setEntryTs]     = useState<string | null>(null)
  const [slotOpen, setSlotOpen]       = useState(false)
  const [slotTs, setSlotTs]           = useState<Date | null>(null)
  const [slotEventSearch, setSlotEventSearch] = useState("")
  const [slotCompExpanded, setSlotCompExpanded] = useState(false)
  const [syncState, setSyncState] = useState<"saved" | "saving" | "failed" | "offline">("saved")
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  // Vitals sheet — text input refs for auto-advance focus chaining (state +
  // logic now in useVitalsEntry, called further down once setTimetable exists)
  const vSysRef = useRef<TextInput | null>(null)
  const vDiaRef = useRef<TextInput | null>(null)
  const vHRRef = useRef<TextInput | null>(null)
  const vSpO2Ref = useRef<TextInput | null>(null)
  const vEtco2Ref = useRef<TextInput | null>(null)
  const vTempRef = useRef<TextInput | null>(null)
  const vBglRef = useRef<TextInput | null>(null)

  // Infusion sheets
  const {
    infOpen, setInfOpen, infDrug, setInfDrug, infRate, setInfRate,
    infRoute, setInfRoute, infConcentration, setInfConcentration,
    infActOpen, setInfActOpen, infActTgt, setInfActTgt, infActRate, setInfActRate,
    infActConcentration, setInfActConcentration,
    openInfusion, confirmInfusion, stopInfusion, changeRate,
  } = useInfusionEntry(save, setEntryTs, setActiveInfusions, INFUSION_CODES)

  // Drug sheet
  const {
    drugOpen, setDrugOpen, drugCat, setDrugCat, drugPick, setDrugPick, drugDose, setDrugDose,
    drugRoute, setDrugRoute, drugConcentration, setDrugConcentration,
    openDrug, confirmDrug, startDrugAsInfusion, openDrugPreset,
  } = useDrugEntry(save, setEntryTs, DRUG_CATS, INF_DRUGS, setInfDrug, setInfRate, setInfOpen, DRUG_CODES)

  // Fluid sheet + end options
  const {
    flOpen, setFlOpen, flFluid, setFlFluid, flVol, setFlVol,
    flEndOpen, setFlEndOpen, flEndTarget, setFlEndTarget, flEndCustom, setFlEndCustom,
    openFluid, confirmFluid, openFluidEnd, confirmFluidEnd, stopFluidDirect,
  } = useFluidEntry(save, setEntryTs, setActiveFluids)

  // Agent sheet
  const { agOpen, setAgOpen, agPick, setAgPick, agPercent, setAgPercent, openAgent, confirmAgent, stopAgent } =
    useAgentEntry(save, setEntryTs, activeAgent, setActiveAgent)
  // Gas settings sheet (FGF/carrier gas/FiO2) - event-based gas_start/gas_change/gas_stop.
  const { gasOpen, setGasOpen, gasFgf, setGasFgf, gasCarrierGas, setGasCarrierGas, gasFio2, setGasFio2, openGasSettings, confirmGasSettings, stopGasSettings } =
    useGasSettingsEntry(save, setEntryTs, activeGas, setActiveGas)
  const gasInitializedRef  = useRef(false)
  const awInitializedRef   = useRef(false)

  // Airway detail sheet
  const [airwayOpen,   setAirwayOpen]   = useState(false)
  const [airwayLabel,  setAirwayLabel]  = useState("")
  const [airwayDetail, setAirwayDetail] = useState<AirwayDetail>({ tubeSize:"7.0", cuffed:"yes", tool:"Direct", cl:"" })

  // Edit drug event modal
  const [editOpen, setEditOpen] = useState(false)
  const [editEv,   setEditEv]   = useState<LogEvent | null>(null)
  const [editDose, setEditDose] = useState("")
  const [editTime, setEditTime] = useState("")
  const [undoEv, setUndoEv] = useState<LogEvent | null>(null)

  // End-case cleanup sheet
  const [endCaseOpen, setEndCaseOpen]   = useState(false)
  const [startAtOpen, setStartAtOpen]   = useState(false)
  const [startAtInput, setStartAtInput] = useState("")
  // Per-item decisions when ending with running items: "stop" | "continue"
  const [endCaseDecisions, setEndCaseDecisions] = useState<Record<string, "stop" | "continue">>({})
  // Items the user chose to continue postoperatively (collected at finaliseCase)
  const [continuedPostopItems, setContinuedPostopItems] = useState<string[]>([])

  // Case ended state
  const [caseEnded, setCaseEnded] = useState(false)
  const caseEndedAtRef = useRef<Date | null>(null)
  const [resumeSecsLeft, setResumeSecsLeft] = useState(0)

  // Vitals reminder notifications (opt-in; reset on each manual vitals entry)
  const { noteVitals } = useCaseReminders(!caseEnded)

  // Complications
  const [compOpen,             setCompOpen]             = useState(false)
  const [selectedComplications, setSelectedComplications] = useState<string[]>([])
  const [complicationsNotes,   setComplicationsNotes]   = useState("")
  const [compGroupExpanded,    setCompGroupExpanded]    = useState<Record<string, boolean>>({})
  const [compSaving,           setCompSaving]           = useState(false)

  // Premedication
  const [premedEveningText, setPremedEveningText] = useState("")
  const [premedMorningText, setPremedMorningText] = useState("")
  const [premedSaving,      setPremedSaving]      = useState(false)
  const prevTabRef        = useRef<string>("equipment")

  // Equipment tab
  const [preop, setPreop] = useState<{
    age?: number; weight?: number; height?: number; sex?: string
    mallampati?: string; neckMobility?: string; mouthOpeningCm?: number; cormackLehane?: string
    comorbidities?: { label: string; code?: string }[]
    currentMedications?: { label: string; atcCode?: string }[]
  } | null>(null)

  // Timing tab
  const [caseMonthYear,   setCaseMonthYear]   = useState("")
  const [caseStartTime,   setCaseStartTime]   = useState("")
  const [caseEndTime,     setCaseEndTime]     = useState("")
  const [caseEndNextDay,  setCaseEndNextDay]  = useState(false)
  const [timingSaving,    setTimingSaving]    = useState(false)

  // Position / Monitoring / Techniques tab state
  const [positions,      setPositions]      = useState<string[]>([])
  const [monitoring,     setMonitoring]     = useState<string[]>([])
  const [techniques,     setTechniques]     = useState<string[]>([])
  const [fieldSaving,    setFieldSaving]    = useState<string | null>(null)

  // Monitoring advanced section
  const [advMonOpen, setAdvMonOpen] = useState(false)
  const [autoFillVitals, setAutoFillVitals] = useState(false)
  const [autoFillBP,     setAutoFillBP]     = useState(false)
  const [autoFillBg,     setAutoFillBg]     = useState(false)

  // Airway tab (separate from timetable airway event logging)
  const [awTools,          setAwTools]          = useState<string[]>([])
  const [awDevices,        setAwDevices]         = useState<string[]>([])
  const [awLmaSize,        setAwLmaSize]         = useState<string | null>(null)
  const [awOralTubeSize,   setAwOralTubeSize]    = useState<string | null>(null)
  const [awOralCuffed,     setAwOralCuffed]      = useState<boolean | null>(null)
  const [awNasalTubeSize,  setAwNasalTubeSize]   = useState<string | null>(null)
  const [awNasalCuffed,    setAwNasalCuffed]     = useState<boolean | null>(null)
  const [awDltType,        setAwDltType]         = useState<"Carlens" | "Robertshaw" | null>(null)
  const [awDltSide,        setAwDltSide]         = useState<"Left" | "Right" | null>(null)
  const [awDltSize,        setAwDltSize]         = useState<number | null>(null)
  const [awEbSize,         setAwEbSize]          = useState<number | null>(null)
  const [awExpandedDevice, setAwExpandedDevice]  = useState<string | null>(null)
  const awExpandedWasComplete = React.useRef(false)
  const [awClGrade,        setAwClGrade]         = useState("")
  const [awVentModes,      setAwVentModes]       = useState<string[]>([])
  const [awVentExpanded,   setAwVentExpanded]    = useState<"assisted" | "controlled" | null>(null)
  const [awNotes,          setAwNotes]           = useState("")
  const [airwaySectionSaving, setAirwaySectionSaving] = useState(false)

  // Vascular access tab
  const [vascularAccesses, setVascularAccesses] = useState<VascularEntry[]>([])
  const [vascularSaving,   setVascularSaving]    = useState(false)

  // Technique tree navigation
  const [techPath,      setTechPath]      = useState<string[]>([])
  const [otherTechText, setOtherTechText] = useState("")

  // Premedication library picker
  const [premedPickOpen,  setPremedPickOpen]  = useState(false)
  const [premedPickPhase, setPremedPickPhase] = useState<"evening"|"morning">("evening")
  const [premedPickCat,   setPremedPickCat]   = useState<string|null>(null)
  const [premedPickDrug,  setPremedPickDrug]  = useState<PremDrug|null>(null)
  const [premedPickDose,  setPremedPickDose]  = useState("")
  const [premedPickRoute, setPremedPickRoute] = useState("PO")

  function openPremedPicker(phase: "evening" | "morning") {
    setPremedPickPhase(phase); setPremedPickCat(null); setPremedPickDrug(null)
    setPremedPickDose(""); setPremedPickRoute("PO"); setPremedPickOpen(true)
  }

  // Chart tab
  const [timetable,  setTimetable]  = useState<TimetableData>(emptyTimetable())
  const [ttColCount, setTtColCount] = useState(12)
  const [chartPage,  setChartPage]  = useState(0)

  const {
    vitOpen, setVitOpen, vitMode, setVitMode, vitScanBusy, editingVitalId, setEditingVitalId,
    vSys, setVSys, vDia, setVDia, vHR, setVHR, vSpO2, setVSpO2, vEtco2, setVEtco2, vTemp, setVTemp, vBgl, setVBgl,
    openVitals, confirmVitals, scanVitalsFromCamera, setAndAdvance,
  } = useVitalsEntry(save, syncLog, setEntryTs, entryTs, log, logRef, setLog, startRef, setTimetable, eventsToTimetable, roundDown5Min, id, tc("errorLabel"), etco2Unit, temperatureUnit)

  // ── Load auto-fill settings from SecureStore (once) ──────────────────
  useEffect(() => {
    SecureStore.getItemAsync("intraop_autofill_vitals").then(v => setAutoFillVitals(v === "on"))
    SecureStore.getItemAsync("intraop_autofill_bp").then(v => setAutoFillBP(v === "on"))
    SecureStore.getItemAsync("intraop_autofill_bg").then(v => setAutoFillBg(v === "on"))
  }, [])

  // ── Load ──────────────────────────────────────────────────────────────

  const loadCase = useCallback(async (silent = false) => {
    try {
      const data = await apiJson<any>(`/api/cases/${id}`)
      const caseTechniques: string[] = Array.isArray(data.intraop?.techniques) ? data.intraop.techniques as string[] : []
      // Resolve async data before the sync batch
      const kev = (data.intraop?.keyEvents ?? {}) as any
      const serverRaw: LogEvent[] = Array.isArray(kev.log) ? kev.log : []
      const startHHMM = hhmmFromStoredTime(data.intraop?.startTime)
      const webStartRef = startHHMM ? caseDateForHHMM(startHHMM) : null
      const webRaw = serverRaw.length === 0 && webStartRef ? webTimetableToLog(kev, roundDown5Min(webStartRef)) : []
      const pending = await loadPendingEvents(id)
      const raw = mergeLogWithPending(serverRaw.length > 0 ? serverRaw : webRaw, pending)
      legacyWebLogNeedsSyncRef.current = serverRaw.length === 0 && webRaw.length > 0
      baseIntraopUpdatedAtRef.current = data.intraop?.updatedAt ?? data.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
      // Batch all synchronous state updates into a single render pass
      runBatched(() => {
      setCaseInfo({
        caseCode:    data.caseCode,
        procedure:   data.preop?.plannedProcedure,
        diagnosis:   data.preop?.diagnosis,
        techniques:  caseTechniques,
        status:      data.status,
        finalizedAt: data.finalizedAt ?? null,
      })
      if (!silent) {
      setTechniques(caseTechniques)
      if (Array.isArray(data.intraop?.positions)) setPositions(data.intraop.positions as string[])
      const mon: string[] = []
      for (const opt of MONITORING_OPTS) {
        if ((data.intraop as any)?.[opt.field]) mon.push(opt.label)
      }
      setMonitoring(mon)

      // Load preop patient data for equipment tab (canonical names: ageYears/weightKg/heightCm)
      const pd = data.preop ?? {}
      setPreop({
        age:    pd.ageYears  != null ? Number(pd.ageYears)  : pd.age    != null ? Number(pd.age)    : undefined,
        weight: pd.weightKg  != null ? Number(pd.weightKg)  : pd.weight != null ? Number(pd.weight) : undefined,
        height: pd.heightCm  != null ? Number(pd.heightCm)  : pd.height != null ? Number(pd.height) : undefined,
        sex:    pd.sex ?? undefined,
        mallampati:      pd.mallampati ?? undefined,
        neckMobility:    pd.neckMobility ?? undefined,
        mouthOpeningCm:  pd.mouthOpeningCm != null ? Number(pd.mouthOpeningCm) : undefined,
        cormackLehane:   pd.cormackLehane ?? undefined,
        comorbidities:   Array.isArray(pd.comorbidities) ? pd.comorbidities : [],
        currentMedications: Array.isArray(pd.currentMedications) ? pd.currentMedications : [],
      })

      // Load timing fields — auto-populate month/year from device clock if not yet saved
      if (data.intraop?.monthYear) {
        setCaseMonthYear(data.intraop.monthYear)
      } else {
        const now = new Date()
        setCaseMonthYear(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
      }
      // startTime may arrive as a full ISO string (e.g. "0000-01-01T00:00:00.000Z") — extract HH:MM only
      const rawStart = data.intraop?.startTime
      if (rawStart) {
        if (rawStart.includes("T")) {
          const d = new Date(rawStart)
          if (!isNaN(d.getTime())) {
            setCaseStartTime(`${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`)
          }
          // else: bogus epoch date — leave empty so user sets it
        } else {
          setCaseStartTime(rawStart)
        }
      }
      const rawEnd = data.intraop?.endTime
      if (rawEnd) {
        if (rawEnd.includes("T")) {
          const d = new Date(rawEnd)
          if (!isNaN(d.getTime())) {
            setCaseEndTime(`${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`)
          }
        } else {
          setCaseEndTime(rawEnd)
        }
      }
      if (data.intraop?.endTimeNextDay != null) setCaseEndNextDay(!!data.intraop.endTimeNextDay)

      // Load airway tab fields
      if (Array.isArray(data.intraop?.airwayTools))   setAwTools(data.intraop.airwayTools)
      if (Array.isArray(data.intraop?.airwayDevices)) setAwDevices(data.intraop.airwayDevices)
      if (data.intraop?.lmaSize != null) setAwLmaSize(String(data.intraop.lmaSize))
      if (data.intraop?.oralTubeSize != null) setAwOralTubeSize(String(data.intraop.oralTubeSize))
      if (data.intraop?.oralCuffed != null) setAwOralCuffed(!!data.intraop.oralCuffed)
      if (data.intraop?.nasalTubeSize != null) setAwNasalTubeSize(String(data.intraop.nasalTubeSize))
      if (data.intraop?.nasalCuffed != null) setAwNasalCuffed(!!data.intraop.nasalCuffed)
      if (data.intraop?.dltType != null) setAwDltType(data.intraop.dltType as "Carlens" | "Robertshaw")
      if (data.intraop?.dltSide != null) setAwDltSide(data.intraop.dltSide as "Left" | "Right")
      if (data.intraop?.dltSize != null) setAwDltSize(Number(data.intraop.dltSize))
      if (data.intraop?.endobronchialSize != null) setAwEbSize(Number(data.intraop.endobronchialSize))
      if (data.intraop?.cormackLehane != null) setAwClGrade(data.intraop.cormackLehane)
      if (Array.isArray(data.intraop?.ventilationModes)) {
        const modes: string[] = data.intraop.ventilationModes
        setAwVentModes(modes)
        // Auto-open the appropriate vent sub-panel if sub-modes present
        if (VENT_ASSISTED.some(a => modes.includes(a.v))) setAwVentExpanded("assisted")
        else if (VENT_CONTROLLED.some(c => modes.includes(c.v))) setAwVentExpanded("controlled")
      }
      if (data.intraop?.airwayNotes != null) setAwNotes(data.intraop.airwayNotes)
      // Init advanced monitoring open if any advanced field is selected
      const advFields = MONITORING_OPTS.filter(o => o.section !== "standard").map(o => o.field)
      if (advFields.some(f => (data.intraop as any)?.[f])) setAdvMonOpen(true)

      // Load vascular accesses
      if (Array.isArray(data.intraop?.vascularAccesses)) setVascularAccesses(data.intraop.vascularAccesses as VascularEntry[])
      // Load premedication fields
      if (data.intraop?.premedicationEvening != null) setPremedEveningText(data.intraop.premedicationEvening)
      if (data.intraop?.premedicationMorning != null) setPremedMorningText(data.intraop.premedicationMorning)

      // Load complications field — parse back into selectedComplications + notes
      if (data.intraop?.complications) {
        const raw: string = data.intraop.complications
        const dashIdx = raw.indexOf(" — ")
        if (dashIdx !== -1) {
          const compsPart  = raw.slice(0, dashIdx)
          const notesPart  = raw.slice(dashIdx + 3)
          setSelectedComplications(compsPart.split("; ").filter(Boolean))
          setComplicationsNotes(notesPart)
        } else {
          // Could be only notes or only complications — check against known items
          const knownItems = COMPLICATION_GROUPS.flatMap(g => g.items)
          const parts = raw.split("; ").filter(Boolean)
          const allKnown = parts.every(p => knownItems.includes(p))
          if (allKnown && parts.length > 0) {
            setSelectedComplications(parts)
            setComplicationsNotes("")
          } else {
            setSelectedComplications([])
            setComplicationsNotes(raw)
          }
        }
      }
      } // end !silent guard

      setPendingCount(pending.length)
      setSyncState(pending.length > 0 ? "failed" : "saved")
      setLog(raw)

      // Oldest event = start of case
      if (raw.length > 0) {
        startRef.current = new Date(raw[raw.length - 1].ts)
        setElapsedMs(Date.now() - startRef.current.getTime())
      }

      // Rebuild active state from sorted log
      const infMap: Record<string, ActiveInfusion> = {}
      const flMap:  Record<string, ActiveFluid>    = {}
      let agent: { name: string; color: string; percent?: number } | null = null
      let gas: ActiveGasSettings = null
      for (const ev of [...raw].reverse()) { // process chrono order
        if (ev.type === "infusion_start")
          infMap[ev.infId!] = { infId:ev.infId!, name:ev.name!, rate:ev.rate!, unit:ev.unit!, color:ev.color!, concentration: ev.concentration, route: ev.drugRoute }
        else if (ev.type === "infusion_stop") delete infMap[ev.infId!]
        else if (ev.type === "infusion_rate" && infMap[ev.infId!]) { infMap[ev.infId!].rate = ev.rate!; if (ev.concentration) infMap[ev.infId!].concentration = ev.concentration }
        else if (ev.type === "fluid_start")
          flMap[ev.fluidId!] = { fluidId:ev.fluidId!, name:ev.name!, volume:ev.volume!, color:ev.color! }
        else if (ev.type === "fluid_end") delete flMap[ev.fluidId!]
        else if (ev.type === "agent_start") agent = { name:ev.name!, color:ev.color!, percent: ev.value != null ? Number(ev.value) : undefined }
        else if (ev.type === "agent_stop")  agent = null
        else if (ev.type === "gas_start" || ev.type === "gas_change") gas = { fgf: ev.fgf!, carrierGas: ev.carrierGas ?? null, fio2: ev.fio2!, fiAir: ev.fiAir, fiN2O: ev.fiN2O }
        else if (ev.type === "gas_stop") gas = null
      }
      setActiveInfusions(Object.values(infMap))
      setActiveFluids(Object.values(flMap))
      setActiveAgent(agent)
      setActiveGas(gas)

      // Project to timetable (use rounded-down 5-min start for column alignment)
      if (raw.length > 0 && startRef.current) {
        const roundedStart = roundDown5Min(startRef.current)
        setTimetable(eventsToTimetable(raw, roundedStart, new Date()))
        setTtColCount(Math.max(12, Math.ceil((Date.now() - roundedStart.getTime()) / (5 * 60_000)) + 12))
      }
      setCaseLoaded(true)
      }) // end runBatched
    } catch (err) {
      if (!silent) {
        const message = err instanceof Error ? err.message : "Could not load case."
        Alert.alert(tc("errorLabel"), message)
      }
    }
  }, [id, MONITORING_OPTS, tc])

  useEffect(() => {
    loadCase()
  }, [loadCase])

  useCaseLiveUpdates(id, () => loadCase(true), { pollIntervalMs: 15_000 })
  const savePremedicationRef = useRef<(overrides?: { evening?: string | null; morning?: string | null }) => Promise<void>>(async () => {})
  const saveAirwaySectionRef = useRef<() => Promise<void>>(async () => {})
  const patchIntraopSectionRef = useRef<(payload: Record<string, unknown>) => Promise<any>>(async () => {})
  const persistAutoFilledVitalsRef = useRef<(fromCol: number, toCol: number) => Promise<void>>(async () => {})

  // ── Anesthesia technique → monitoring auto-select ─────────────────────
  // Additive: only adds monitors required by the selected techniques, never removes.
  // Called every time a technique is toggled by the user (not on case load).
  function computeMonitoringDefaults(techs: string[], currentMonitoring: string[]): string[] | null {
    const isGA       = techs.some(t => ["GENERAL_INHALATION","GENERAL_TIVA","GENERAL_COMBINED"].includes(t))
    const isTIVA     = techs.includes("GENERAL_TIVA")
    const isNeuraxial = techs.some(t => t.startsWith("SPINAL") || t.startsWith("EPIDURAL") || t === "CSE" || t === "DPE")
    const next = [...currentMonitoring]
    const add = (label: string) => { if (!next.includes(label)) next.push(label) }
    if (isGA || isNeuraxial) { add("ECG"); add("SpO₂"); add("NIBP"); add("Capnography (EtCO₂)") }
    if (isGA) { add("Temperature"); if (isTIVA) add("BIS") }
    return next.length > currentMonitoring.length ? next : null
  }

  // Save premedication when navigating away from the premed tab
  useEffect(() => {
    if (prevTabRef.current === "premedication" && tab !== "premedication") {
      void savePremedicationRef.current()
    }
    prevTabRef.current = tab
   
  }, [screenWidth, tab])

  // ── Resume countdown timer ────────────────────────────────────────────

  useEffect(() => {
    if (resumeSecsLeft <= 0) return
    const t = setInterval(() => {
      if (!caseEndedAtRef.current) return
      const elapsed = Math.floor((Date.now() - caseEndedAtRef.current.getTime()) / 1000)
      const remaining = Math.max(0, 30 * 60 - elapsed)
      setResumeSecsLeft(remaining)
      if (remaining === 0) clearInterval(t)
    }, 1000)
    return () => clearInterval(t)
   
  }, [resumeSecsLeft])

  // ── Airway autosave — debounced 600 ms after any airway field changes ──
  // Most airway fields are buttons/toggles with no onBlur, so we watch all
  // relevant state variables and save automatically after a short pause.
  const airwaySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!caseLoaded) return  // skip during initial load
    if (!awInitializedRef.current) { awInitializedRef.current = true; return } // skip first fire after load
    if (airwaySaveTimerRef.current) clearTimeout(airwaySaveTimerRef.current)
    airwaySaveTimerRef.current = setTimeout(() => { void saveAirwaySectionRef.current() }, 600)
    return () => { if (airwaySaveTimerRef.current) clearTimeout(airwaySaveTimerRef.current) }
   
  }, [awTools, awDevices, awLmaSize, awOralTubeSize, awOralCuffed, awNasalTubeSize, awNasalCuffed, awDltType, awDltSide, awDltSize, awEbSize, awClGrade, awVentModes, awNotes, caseLoaded])
  // Keep logRef current so the interval can read the latest log without stale closure
  useEffect(() => { logRef.current = log }, [log])

  // ── Fluid totals (crystalloids/colloids/blood) ──────────────────────────
  // Mirrors web's IntraopForm.tsx auto-calc effect — sums timetable.fluids by
  // category and saves the three canonical totals to the case record.
  // timetable is rebuilt every 10s by the elapsed clock (new array reference
  // each time even when fluids haven't changed), so guard on the computed
  // totals themselves rather than the array reference to avoid a PATCH storm.
  const lastFluidTotalsRef = useRef<string>("")
  useEffect(() => {
    let crystalloids = 0, colloids = 0, blood = 0
    for (const f of timetable.fluids ?? []) {
      const vol = parseFloat(f.volume) || 0
      if (!vol) continue
      if (f.category === "Crystalloids") crystalloids += vol
      else if (f.category === "Colloids") colloids += vol
      else if (f.category === "Blood products") blood += vol
    }
    const key = `${crystalloids}|${colloids}|${blood}`
    if (key === lastFluidTotalsRef.current) return
    lastFluidTotalsRef.current = key
    patchIntraopSectionRef.current({ crystalloidsMl: crystalloids || null, colloidsMl: colloids || null, bloodMl: blood || null }).catch(() => {})
  }, [timetable.fluids, id])

  // ── Elapsed clock ─────────────────────────────────────────────────────

  useEffect(() => {
    const t = setInterval(() => {
      if (!startRef.current) return
      const now = new Date()
      setElapsedMs(now.getTime() - startRef.current.getTime())
      // Rebuild timetable so open-end fluids/infusions/agents extend to current time
      setTimetable(eventsToTimetable(logRef.current, roundDown5Min(startRef.current), now))
    }, 10_000)
    return () => clearInterval(t)
  }, [])

  // ── Save one event ────────────────────────────────────────────────────

  async function save(partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent = false): Promise<LogEvent> {
    const ev: LogEvent = { id: uid(), ts: tsOverride ?? entryTs ?? new Date().toISOString(), syncStatus: "pending", ...partial }
    const newLog = [ev, ...logRef.current]
    logRef.current = newLog
    setLog(newLog)
    setSyncState("saving")
    const pending = await loadPendingEvents(id)
    await storePendingEvents(id, [ev, ...pending.filter(p => p.id !== ev.id)])
    setPendingCount(pending.length + 1)
    if (!startRef.current) {
      startRef.current = new Date(ev.ts)
      setElapsedMs(0)
    }
    setTimetable(eventsToTimetable(newLog, roundDown5Min(startRef.current!), new Date()))
    try {
      const res = await apiFetch(`/api/cases/${id}/events`, {
        method: legacyWebLogNeedsSyncRef.current ? "PUT" : "POST",
        headers: {
          "X-Idempotency-Key": `${id}:${ev.id}`,
          "X-Lospor-Source": "mobile",
          ...(legacyWebLogNeedsSyncRef.current && baseIntraopUpdatedAtRef.current
            ? { "x-lospor-intraop-updated-at": baseIntraopUpdatedAtRef.current }
            : {}),
        },
        body: legacyWebLogNeedsSyncRef.current
          ? JSON.stringify({ log: [...newLog].reverse().map(eventForServer) })
          : JSON.stringify(eventForServer(ev)),
      })
      if (!res.ok) throw new Error()
      const body = await res.json().catch(() => ({}))
      legacyWebLogNeedsSyncRef.current = false
      baseIntraopUpdatedAtRef.current = body?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
      const remaining = (await loadPendingEvents(id)).filter(p => p.id !== ev.id)
      await storePendingEvents(id, remaining)
      setPendingCount(remaining.length)
      setLog(prev => prev.map(item => item.id === ev.id ? eventForServer(item) : item))
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setSyncState(remaining.length > 0 ? "failed" : "saved")
      if (!silent) {
        setUndoEv(eventForServer(ev))
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        // Manually charting vitals resets the "vitals due" reminder countdown.
        if (ev.type === "vital") noteVitals()
      }
    } catch {
      setLog(prev => prev.map(item => item.id === ev.id ? { ...item, syncStatus: "failed" } : item))
      setSyncState("failed")
      if (!silent) setUndoEv({ ...ev, syncStatus: "failed" })
      if (!silent) Alert.alert("Saved locally", "Network save failed. The event is still visible and will retry from this screen.")
    }
    setEntryTs(null)
    return ev
  }

  // ── Sync log to server (after edit / delete) ──────────────────────────

  async function syncLog(newLog: LogEvent[]) {
    setLog(newLog)
    if (startRef.current) setTimetable(eventsToTimetable(newLog, roundDown5Min(startRef.current), new Date()))
    setSyncState("saving")
    try {
      const res = await apiFetch(`/api/cases/${id}/events`, {
        method: "PUT",
        headers: baseIntraopUpdatedAtRef.current ? { "x-lospor-intraop-updated-at": baseIntraopUpdatedAtRef.current } : undefined,
        body: JSON.stringify({ log: [...newLog].reverse().map(eventForServer) }), // send oldest-first
      })
      if (!res.ok) throw new Error()
      const body = await res.json().catch(() => ({}))
      legacyWebLogNeedsSyncRef.current = false
      baseIntraopUpdatedAtRef.current = body?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
      await storePendingEvents(id, [])
      setPendingCount(0)
      setLog(prev => prev.map(eventForServer))
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setSyncState("saved")
    } catch {
      setSyncState("failed")
      Alert.alert("Sync error", "Could not save change. Reload to restore.")
    }
  }

  // ── Auto-fill vitals: carry forward values when column advances ────────
  const autoFillPrevColRef = useRef<number | null>(null)
  const autoFillBusyRef = useRef(false)

  async function persistAutoFilledVitals(fromCol: number, toCol: number) {
    if (!startRef.current || autoFillBusyRef.current || toCol < fromCol) return
    autoFillBusyRef.current = true
    try {
      const chartStart = roundDown5Min(startRef.current)
      const autoKeys: (keyof VitalsEntry)[] = autoFillBP
        ? ["etco2","temp","spO2","systolic","diastolic","heartRate"]
        : ["etco2","temp","spO2"]

      for (let col = fromCol; col <= toCol; col++) {
        const colStart = chartStart.getTime() + col * 5 * 60_000
        const colEnd = colStart + 5 * 60_000
        const alreadyRecorded = logRef.current.some(ev => {
          const ts = new Date(ev.ts).getTime()
          return ev.type === "vital" && ts >= colStart && ts < colEnd
        })
        if (alreadyRecorded) continue

        const source = logRef.current.find(ev => ev.type === "vital" && new Date(ev.ts).getTime() < colStart)
        if (!source) continue

        const copied: Omit<LogEvent, "id" | "ts"> = { type:"vital" }
        for (const key of autoKeys) {
          const value = source[key]
          if (typeof value === "number") (copied as any)[key] = value
        }
        if (autoKeys.some(key => typeof (copied as any)[key] === "number")) {
          await save(copied, new Date(colStart).toISOString(), true)
        }
      }
    } finally {
      autoFillBusyRef.current = false
    }
  }
  persistAutoFilledVitalsRef.current = persistAutoFilledVitals
  useEffect(() => {
    if (!autoFillVitals) { autoFillPrevColRef.current = null; return }
    const t = setInterval(() => {
      if (!startRef.current) return
      const ms = Date.now() - roundDown5Min(startRef.current).getTime()
      const col = Math.max(0, Math.floor(ms / (5 * 60_000)))
      const prevCol = autoFillPrevColRef.current
      if (prevCol === null) { autoFillPrevColRef.current = col; return }
      if (col <= prevCol) return
      if (autoFillBusyRef.current) return
      void persistAutoFilledVitalsRef.current(prevCol + 1, col).finally(() => {
        autoFillPrevColRef.current = col
      })
    }, 10_000)
    return () => clearInterval(t)
   
  }, [autoFillVitals, autoFillBP])

  // ── Background auto-fill: on case load, backfill gap from last entry to now ──
  useEffect(() => {
    if (!caseLoaded) return
    if (!autoFillBg) return
    if (!startRef.current) return
    const chartStart = roundDown5Min(startRef.current)
    const vitalCols = logRef.current
      .filter(ev => ev.type === "vital")
      .map(ev => Math.max(0, Math.floor((new Date(ev.ts).getTime() - chartStart.getTime()) / (5 * 60_000))))
    if (vitalCols.length === 0) return
    const lastDataCol = Math.max(...vitalCols)
    const currentCol = Math.max(0, Math.floor((Date.now() - chartStart.getTime()) / (5 * 60_000)))
    if (currentCol > lastDataCol) void persistAutoFilledVitalsRef.current(lastDataCol + 1, currentCol)
   
  }, [caseLoaded, autoFillBg, autoFillBP])

  // ── Drug ──────────────────────────────────────────────────────────────

  async function retryPendingEvents() {
    const pending = await loadPendingEvents(id)
    if (pending.length === 0) {
      if (legacyWebLogNeedsSyncRef.current) {
        setSyncState("saving")
        try {
          const res = await apiFetch(`/api/cases/${id}/events`, {
            method: "PUT",
            headers: baseIntraopUpdatedAtRef.current ? { "x-lospor-intraop-updated-at": baseIntraopUpdatedAtRef.current } : undefined,
            body: JSON.stringify({ log: [...logRef.current].reverse().map(eventForServer) }),
          })
          if (!res.ok) throw new Error()
          const body = await res.json().catch(() => ({}))
          baseIntraopUpdatedAtRef.current = body?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
          legacyWebLogNeedsSyncRef.current = false
          setPendingCount(0)
          setLog(prev => prev.map(eventForServer))
          setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
          setSyncState("saved")
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
          return
        } catch {
          setSyncState("failed")
          Alert.alert("Still offline", "The reconstructed web timeline could not sync.")
          return
        }
      }
      setPendingCount(0)
      setSyncState("saved")
      return
    }

    setSyncState("saving")
    if (legacyWebLogNeedsSyncRef.current) {
      try {
        const res = await apiFetch(`/api/cases/${id}/events`, {
          method: "PUT",
          headers: baseIntraopUpdatedAtRef.current ? { "x-lospor-intraop-updated-at": baseIntraopUpdatedAtRef.current } : undefined,
          body: JSON.stringify({ log: [...logRef.current].reverse().map(eventForServer) }),
        })
        if (!res.ok) throw new Error()
        const body = await res.json().catch(() => ({}))
        baseIntraopUpdatedAtRef.current = body?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
        legacyWebLogNeedsSyncRef.current = false
        await storePendingEvents(id, [])
        setPendingCount(0)
        setLog(prev => prev.map(eventForServer))
        setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
        setSyncState("saved")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        return
      } catch {
        setSyncState("failed")
        Alert.alert("Still offline", `${pending.length} event${pending.length === 1 ? "" : "s"} could not sync.`)
        return
      }
    }

    const failed: LogEvent[] = []
    for (const ev of [...pending].reverse()) {
      try {
        const res = await apiFetch(`/api/cases/${id}/events`, {
          method: "POST",
          headers: {
            "X-Idempotency-Key": `${id}:${ev.id}`,
            "X-Lospor-Source": "mobile",
          },
          body: JSON.stringify(eventForServer(ev)),
        })
        if (!res.ok) throw new Error()
        const body = await res.json().catch(() => ({}))
        baseIntraopUpdatedAtRef.current = body?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
        setLog(prev => prev.map(item => item.id === ev.id ? eventForServer(item) : item))
      } catch {
        failed.push({ ...ev, syncStatus: "failed" })
      }
    }

    await storePendingEvents(id, failed)
    setPendingCount(failed.length)
    if (failed.length === 0) {
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setSyncState("saved")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } else {
      setSyncState("failed")
      Alert.alert("Still offline", `${failed.length} event${failed.length === 1 ? "" : "s"} could not sync.`)
    }
  }

  async function removeEvent(ev: LogEvent, sync = true) {
    const next = log.filter(x => x.id !== ev.id)
    const remainingPending = (await loadPendingEvents(id)).filter(p => p.id !== ev.id)
    await storePendingEvents(id, remainingPending)
    setPendingCount(remainingPending.length)
    setLog(next)
    if (startRef.current) setTimetable(eventsToTimetable(next, roundDown5Min(startRef.current)))
    if (sync && !ev.syncStatus) await syncLog(next)
    else setSyncState(remainingPending.length > 0 ? "failed" : "saved")
  }

  async function undoLastEvent() {
    if (!undoEv) return
    await removeEvent(undoEv)
    setUndoEv(null)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
  }

  function emergencyShortcut(kind: "hypotension" | "desaturation" | "bradycardia" | "airway") {
    const ts = new Date().toISOString()
    if (kind === "hypotension") {
      Alert.alert("Hypotension", "Log event or open a common rescue drug.", [
        { text: "Phenylephrine 100 mcg", onPress: () => { setEntryTs(ts); openDrugPreset("Phenylephrine", "100") } },
        { text: "Ephedrine 10 mg", onPress: () => { setEntryTs(ts); openDrugPreset("Ephedrine", "10") } },
        { text: "Log event", onPress: () => save({ type:"clinical_event", label:"Hypotension", color:"#ef4444" }) },
        { text: tc("cancelLabel"), style:"cancel" },
      ])
    } else if (kind === "desaturation") {
      Alert.alert("Desaturation", "Fast airway/oxygenation event.", [
        { text: "Log desaturation", onPress: () => save({ type:"clinical_event", label:"Desaturation", color:"#06b6d4" }) },
        { text: "Airway note", onPress: () => { setAirwayLabel("Intubated"); setAirwayOpen(true) } },
        { text: tc("cancelLabel"), style:"cancel" },
      ])
    } else if (kind === "bradycardia") {
      Alert.alert("Bradycardia", "Log event or open atropine.", [
        { text: "Atropine 0.5 mg", onPress: () => { setEntryTs(ts); openDrugPreset("Atropine", "0.5") } },
        { text: "Log event", onPress: () => save({ type:"clinical_event", label:"Bradycardia", color:"#22c55e" }) },
        { text: tc("cancelLabel"), style:"cancel" },
      ])
    } else {
      Alert.alert("Difficult airway", "Log a difficult airway event or add airway detail.", [
        { text: "Airway detail", onPress: () => { setAirwayLabel("Intubated"); setAirwayOpen(true) } },
        { text: "Log difficult airway", onPress: () => save({ type:"clinical_event", label:"Difficult airway", color:"#6366f1" }) },
        { text: tc("cancelLabel"), style:"cancel" },
      ])
    }
  }

  // ── Airway detail ─────────────────────────────────────────────────────

  async function confirmAirway() {
    const d = airwayDetail
    const detail = airwayLabel === "Intubated"
      ? `${d.tubeSize}mm ${d.cuffed==="yes"?"cuffed":"uncuffed"} · ${d.tool}${d.cl ? ` · CL ${d.cl}` : ""}`
      : `LMA ${d.tubeSize}`
    const color = clinicalEventColor(airwayLabel)
    await save({ type:"clinical_event", label:`${airwayLabel} (${detail})`, color })
    setAirwayOpen(false)
  }

  // ── Long-press drug event ──────────────────────────────────────────────

  function longPressDrug(ev: LogEvent) {
    Alert.alert(
      `${ev.name} ${ev.dose}${ev.unit}`,
      formatTs(ev.ts),
      [
        { text: "Repeat dose", onPress: () => save({ type:"drug", name:ev.name, dose:ev.dose, unit:ev.unit, category:ev.category, color:ev.color }) },
        { text: "Edit", onPress: () => { setEditEv(ev); setEditDose(ev.dose ?? ""); setEditTime(formatTs(ev.ts)); setEditOpen(true) } },
        { text: "Delete", style:"destructive", onPress: () => removeEvent(ev) },
        { text: tc("cancelLabel"), style:"cancel" },
      ]
    )
  }

  function eventActions(ev: LogEvent) {
    const actions: any[] = []
    if (ev.type === "drug") {
      actions.push({ text: "Repeat dose", onPress: () => save({ type:"drug", name:ev.name, dose:ev.dose, unit:ev.unit, category:ev.category, color:ev.color }) })
      actions.push({ text: "Edit dose/time", onPress: () => { setEditEv(ev); setEditDose(ev.dose ?? ""); setEditTime(formatTs(ev.ts)); setEditOpen(true) } })
    } else {
      actions.push({ text: "Edit time", onPress: () => { setEditEv(ev); setEditDose(""); setEditTime(formatTs(ev.ts)); setEditOpen(true) } })
    }
    actions.push({ text: "Delete", style:"destructive", onPress: () => removeEvent(ev) })
    actions.push({ text: tc("cancelLabel"), style:"cancel" })
    Alert.alert(eventLabel(ev).text, formatTs(ev.ts), actions)
  }

  function confirmEdit() {
    if (!editEv) return
    const newLog = log.map(x => {
      if (x.id !== editEv.id) return x
      const [hh, mm] = editTime.split(":").map(Number)
      const newTs = new Date(x.ts)
      if (!isNaN(hh) && !isNaN(mm)) { newTs.setHours(hh); newTs.setMinutes(mm) }
      return { ...x, ...(x.type === "drug" ? { dose: editDose } : {}), ts: newTs.toISOString() }
    })
    syncLog(newLog)
    setEditOpen(false); setEditEv(null)
  }

  function promptDelete(ev: LogEvent) {
    Alert.alert("Delete event", `Remove "${eventLabel(ev).text}"?`, [
      { text: tc("cancelLabel"), style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => removeEvent(ev) },
    ])
  }

  // ── Start case ────────────────────────────────────────────────────────

  async function startCaseNow() {
    if (startRef.current) return
    const nowHHMM = `${String(new Date().getHours()).padStart(2,"0")}:${String(new Date().getMinutes()).padStart(2,"0")}`
    setCaseStartTime(nowHHMM)
    saveTiming({ startTime: nowHHMM })
    // Optimistically promote status — server promotes DRAFT→IN_PROGRESS when startTime is sent
    setCaseInfo(prev => prev && prev.status === "DRAFT" ? { ...prev, status: "IN_PROGRESS" } : prev)
    await save({ type: "clinical_event", label: "Anaesthesia start", color: "#22c55e" })
  }

  async function startCaseAt(hhmm: string) {
    if (startRef.current) return
    const [h, m] = hhmm.split(":").map(Number)
    if (isNaN(h) || isNaN(m)) return
    const startDate = new Date()
    startDate.setHours(h, m, 0, 0)
    if (startDate.getTime() > Date.now()) startDate.setDate(startDate.getDate() - 1)
    startRef.current = startDate
    setElapsedMs(Date.now() - startDate.getTime())
    setCaseStartTime(hhmm)
    saveTiming({ startTime: hhmm })
    setCaseInfo(prev => prev && prev.status === "DRAFT" ? { ...prev, status: "IN_PROGRESS" } : prev)
    await save({ type: "clinical_event", label: "Anaesthesia start", color: "#22c55e" }, startDate.toISOString())
    setStartAtOpen(false)
  }

  // ── End case ──────────────────────────────────────────────────────────

  function openEndCase() {
    if (activeInfusions.length > 0 || activeFluids.length > 0 || activeAgent || activeGas) {
      // Reset per-item decisions so the sheet starts fresh each time
      setEndCaseDecisions({})
      setEndCaseOpen(true)
    } else {
      Alert.alert("End case", "All active items clear. Continue to postoperative form?", [
        { text: tc("cancelLabel"), style:"cancel" },
        { text: "Continue", onPress: () => finaliseCase([]) },
      ])
    }
  }

  function finaliseCase(continuedItems: string[]) {
    setEndCaseOpen(false)
    if (continuedItems.length > 0) setContinuedPostopItems(continuedItems)
    const nowHHMM = `${String(new Date().getHours()).padStart(2,"0")}:${String(new Date().getMinutes()).padStart(2,"0")}`
    setCaseEndTime(nowHHMM)
    saveTiming({ endTime: nowHHMM })
    setCaseEnded(true)
    caseEndedAtRef.current = new Date()
    setResumeSecsLeft(30 * 60)
  }

  function resumeCase() {
    setCaseEnded(false)
    caseEndedAtRef.current = null
    setResumeSecsLeft(0)
    setCaseEndTime("")
    patchIntraopSection({ endTime: null }).catch(() => {})
  }

  // ── Complications save ────────────────────────────────────────────

  function buildComplicationsString(): string | null {
    const comps = selectedComplications.join("; ")
    const notes = complicationsNotes.trim().slice(0, 500)
    if (comps && notes) return `${comps} — ${notes}`
    if (comps) return comps
    if (notes) return notes
    return null
  }

  async function patchIntraopSection(payload: Record<string, unknown>) {
    setSyncState("saving")
    const result = await saveCasePatchWithQueue(id, "intraop", payload, baseIntraopUpdatedAtRef.current)
    if (result.result === "saved") {
      baseIntraopUpdatedAtRef.current = result.response?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setSyncState("saved")
    } else if (result.result === "queued") {
      setSyncState("offline")
    }
    return result
  }
  patchIntraopSectionRef.current = patchIntraopSection

  // Mirrors web's onComplicationAdded (IntraopForm.tsx) — when a clinical event
  // flagged isComplication is logged on the timetable, auto-append its label
  // here too (deduped, additive, never overwrites manually-picked/typed text)
  // and save immediately, same as web's live setValue. Computes the new list
  // directly rather than reading selectedComplications after setState, to
  // avoid the stale-closure bug already worked around in savePremedication.
  function addComplicationFromEvent(label: string) {
    if (selectedComplications.includes(label)) return
    const next = [...selectedComplications, label]
    setSelectedComplications(next)
    const comps = next.join("; ")
    const notes = complicationsNotes.trim().slice(0, 500)
    const complications = comps && notes ? `${comps} — ${notes}` : (comps || notes || null)
    patchIntraopSection({ complications }).catch(() => {})
  }

  async function saveComplications() {
    setCompSaving(true)
    try {
      const complications = buildComplicationsString()
      await patchIntraopSection({ complications })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setCompOpen(false)
    } catch {
      Alert.alert(tc("errorLabel"), "Could not save complications.")
    } finally {
      setCompSaving(false)
    }
  }

  // ── Premedication save ────────────────────────────────────────────

  // Accepts explicit overrides because callers often fire this inside setTimeout
  // right after a setState — without overrides, the closure captured at the time
  // setTimeout was scheduled still reads the pre-update premedEveningText/
  // premedMorningText, silently saving stale text (the "vibrates but doesn't stick" bug).
  async function savePremedication(overrides?: { evening?: string | null; morning?: string | null }) {
    setPremedSaving(true)
    try {
      await patchIntraopSection({
        premedicationEvening: overrides && "evening" in overrides ? (overrides.evening ?? null) : (premedEveningText.trim() || null),
        premedicationMorning: overrides && "morning" in overrides ? (overrides.morning ?? null) : (premedMorningText.trim() || null),
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch {
      Alert.alert(tc("errorLabel"), "Could not save premedication.")
    } finally {
      setPremedSaving(false)
    }
  }
  savePremedicationRef.current = savePremedication

  async function saveTiming(overrides?: { startTime?: string; endTime?: string }) {
    setTimingSaving(true)
    try {
      await patchIntraopSection({
        monthYear: caseMonthYear || null,
        startTime: (overrides?.startTime ?? caseStartTime) || null,
        endTime:   (overrides?.endTime   ?? caseEndTime)   || null,
        endTimeNextDay: caseEndNextDay,
      })
    } catch { /* best-effort */ } finally { setTimingSaving(false) }
  }

  async function saveAirwaySection() {
    setAirwaySectionSaving(true)
    try {
      await patchIntraopSection({
        airwayTools:       awTools,
        airwayDevices:     awDevices,
        lmaSize:           awLmaSize != null ? Number(awLmaSize) : null,
        oralTubeSize:      awOralTubeSize != null ? Number(awOralTubeSize) : null,
        oralCuffed:        awOralCuffed,
        nasalTubeSize:     awNasalTubeSize != null ? Number(awNasalTubeSize) : null,
        nasalCuffed:       awNasalCuffed,
        dltType:           awDltType,
        dltSide:           awDltSide,
        dltSize:           awDltSize,
        endobronchialSize: awEbSize,
        cormackLehane:     awClGrade || null,
        ventilationModes:  awVentModes,
        airwayNotes:       awNotes,
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch {
      Alert.alert(tc("errorLabel"), "Could not save airway data.")
    } finally {
      setAirwaySectionSaving(false)
    }
  }
  saveAirwaySectionRef.current = saveAirwaySection

  async function saveVascularAccesses(next: VascularEntry[]) {
    setVascularSaving(true)
    try {
      await patchIntraopSection({ vascularAccesses: next })
    } catch { /* best-effort */ } finally { setVascularSaving(false) }
  }

  async function savePositions(next: string[]) {
    setFieldSaving("positions")
    try {
      await patchIntraopSection({ positions: next })
    } catch { /* best-effort */ } finally { setFieldSaving(null) }
  }

  async function saveMonitoring(next: string[]) {
    setFieldSaving("monitoring")
    const obj: Record<string, boolean> = {}
    for (const opt of MONITORING_OPTS) obj[opt.field] = next.includes(opt.label)
    try {
      await patchIntraopSection(obj)
    } catch { /* best-effort */ } finally { setFieldSaving(null) }
  }

  async function saveTechniques(next: string[]) {
    setFieldSaving("techniques")
    try {
      const patch: Record<string, unknown> = { techniques: next }
      const monDefaults = computeMonitoringDefaults(next, monitoring)
      if (monDefaults) {
        setMonitoring(monDefaults)
        for (const opt of MONITORING_OPTS) patch[opt.field] = monDefaults.includes(opt.label)
      }
      const isGA = next.some(t => ["GENERAL_INHALATION", "GENERAL_TIVA", "GENERAL_COMBINED"].includes(t))
      const isTIVA = next.includes("GENERAL_TIVA")
      const isNeuraxial = next.some(t => t.startsWith("SPINAL") || t.startsWith("EPIDURAL") || t === "CSE" || t === "DPE")
      const requiredFields = [
        ...(isGA || isNeuraxial ? ["ecg", "spO2Monitor", "nbpMonitor", "etco2Monitor"] : []),
        ...(isGA ? ["tempMonitor"] : []),
        ...(isTIVA ? ["bis"] : []),
      ]
      if (requiredFields.length) {
        const byField = new Map(MONITORING_OPTS.map(opt => [opt.field, opt.label]))
        const withRequiredLabels = [...monitoring]
        for (const field of requiredFields) {
          patch[field] = true
          const label = byField.get(field)
          if (label && !withRequiredLabels.includes(label)) withRequiredLabels.push(label)
        }
        setMonitoring(withRequiredLabels)
      }
      await patchIntraopSection(patch)
      setCaseInfo(prev => prev ? { ...prev, techniques: next } : prev)
    } catch { /* best-effort */ } finally { setFieldSaving(null) }
  }
  function openSlot(col: number) {
    const base = startRef.current ?? new Date()
    setSlotTs(timeAtCol(base, col))
    setSlotOpen(true)
  }

  function openRowQuickAdd(col: number, action: "vital"|"bp"|"drug"|"infusion"|"fluid"|"agent"|"gas"|"event") {
    const ts = timeAtCol(chartStart, col).toISOString()
    switch (action) {
      case "vital":    openVitals("full", ts); break
      case "bp":       openVitals("bp",   ts); break
      case "drug":     openDrug(ts); break
      case "infusion": openInfusion(ts); break
      case "fluid":    openFluid(ts); break
      case "agent":    openAgent(ts); break
      case "gas":      openGasSettings(ts); break
      case "event":    setSlotTs(timeAtCol(chartStart, col)); setSlotOpen(true); break
    }
  }

  function slotIso(): string | undefined {
    return slotTs?.toISOString()
  }

  function openSlotEvent(ev: { label: string; color: string }, isComplication = false) {
    const ts = slotIso()
    // Pass ts directly as tsOverride — setEntryTs is async so reading entryTs state
    // immediately after would still see the previous value and default to now.
    save({ type:"clinical_event", label:ev.label, color:ev.color }, ts ?? undefined)
    if (isComplication) addComplicationFromEvent(ev.label)
    setSlotOpen(false)
  }

  // ── Computed ──────────────────────────────────────────────────────────

  const lastVitals = log.find(e => e.type === "vital")
  const now        = new Date()
  const timeStr    = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`

  function prevVitalFor(idx: number): LogEvent | undefined {
    for (let i = idx + 1; i < log.length; i++) {
      if (log[i].type === "vital") return log[i]
    }
    return undefined
  }

  const activeTechniques = techniques.length > 0 ? techniques : (caseInfo?.techniques ?? [])
  const isGACase         = activeTechniques.some(t => t.startsWith("GENERAL") || /ga|ett|lma|tiva/i.test(t))

  // Technique-aware favorites
  const favNames: string[] = []
  for (const t of activeTechniques) {
    const hits = TECHNIQUE_FAVORITES[t] ?? []
    for (const n of hits) { if (!favNames.includes(n)) favNames.push(n) }
  }
  const favDrugs = favNames.slice(0, 6).map(name => {
    for (const cat of DRUG_CATS) {
      const found = (cat.drugs as readonly { name: string; unit: string }[]).find(d => d.name === name)
      if (found) return { ...found, color: cat.color, catObj: cat }
    }
    return null
  }).filter(Boolean) as { name: string; unit: string; color: string; catObj: typeof DRUG_CATS[number] }[]

  const ROW_H = 60

  const chartStart = startRef.current ? roundDown5Min(startRef.current) : new Date()
  const currentCol = Math.max(0, Math.floor((Date.now() - chartStart.getTime()) / (5 * 60_000)))
  const nowSlotPercent = Math.max(3, Math.min(97, (((Date.now() - chartStart.getTime()) % (5 * 60_000)) / (5 * 60_000)) * 100))
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
    ...timetable.infusions.map(i => i.endCol + 1),
    ...timetable.fluids.map(f => f.endCol + 1),
    ...timetable.agents.map(a => a.endCol + 1),
  )
  const chartRows = Array.from({ length: Math.max(12, maxProjectedCol + 1) }, (_, col) => col)

  function jumpVerticalTimetableToNow() {
    const safeIdx = Math.min(currentCol, chartRows.length - 1)
    if (safeIdx >= 0) {
      verticalTimetableRef.current?.scrollToIndex({ index: safeIdx, animated: true, viewPosition: 0.35 })
    }
  }

  // Auto-scroll to now on mount when switching to timetable tab
  useEffect(() => {
    if (tab !== "log" || !startRef.current) return
    const safeIdx = Math.min(currentCol, chartRows.length - 1)
    if (safeIdx < 0) return
    const timer = setTimeout(() => {
      verticalTimetableRef.current?.scrollToIndex({ index: safeIdx, animated: false, viewPosition: 0.35 })
    }, 80)
    return () => clearTimeout(timer)
   
  }, [chartRows.length, currentCol, tab])

  // Keep awDevices in sync with the currently-open device's own completeness: add it
  // the moment it becomes complete (this is also the gate that gets it to the DB in
  // the first place), and drop it again if an edit blanks a required field back out —
  // a device should never sit confirmed-but-empty. Only auto-collapses on the very
  // first completion, not on every keystroke while re-editing an already-complete
  // entry (awExpandedWasComplete guards that).
  useEffect(() => {
    if (!awExpandedDevice) return
    let complete = false
    switch (awExpandedDevice) {
      case "LMA":              complete = awLmaSize != null; break
      case "ORAL_ETT":         complete = awOralTubeSize != null && awOralCuffed != null; break
      case "NASAL_ETT":        complete = awNasalTubeSize != null && awNasalCuffed != null; break
      case "DOUBLE_LUMEN_TUBE":complete = awDltType != null && awDltSide != null && awDltSize != null; break
      case "ENDOBRONCHIAL_TUBE":complete = awEbSize != null; break
    }
    setAwDevices(prev => {
      const inArray = prev.includes(awExpandedDevice)
      if (complete && !inArray) return [...prev, awExpandedDevice]
      if (!complete && inArray) return prev.filter(d => d !== awExpandedDevice)
      return prev
    })
    if (complete && !awExpandedWasComplete.current) setAwExpandedDevice(null)
   
  }, [awLmaSize, awOralTubeSize, awOralCuffed, awNasalTubeSize, awNasalCuffed, awDltType, awDltSide, awDltSize, awEbSize, awExpandedDevice])

  // Auto-scroll when current 5-min slot advances (every 5 min tick)
  useEffect(() => {
    if (tab !== "log" || expandedRow !== null || !startRef.current) return
    if (prevCurrentColRef.current === currentCol) return
    prevCurrentColRef.current = currentCol
    const safeIdx = Math.min(currentCol, chartRows.length - 1)
    if (safeIdx >= 0) {
      verticalTimetableRef.current?.scrollToIndex({ index: safeIdx, animated: true, viewPosition: 0.35 })
    }
   
  }, [chartRows.length, currentCol, expandedRow, tab])

  const TAB_KEYS = useMemo(() => ["equipment","technique","timing","position","monitoring","airway","vascular","premedication","log","events"], [])

  const tabSwipeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 20,
    onPanResponderRelease: (_, { dx }) => {
      const idx = TAB_KEYS.indexOf(tab)
      if (dx < -50 && idx < TAB_KEYS.length - 1) setTab(TAB_KEYS[idx + 1] as any)
      else if (dx > 50 && idx > 0) setTab(TAB_KEYS[idx - 1] as any)
    },
  }), [TAB_KEYS, tab])

  useEffect(() => {
    const layout = tabLayouts.current[tab]
    if (layout) {
      const scrollX = Math.max(0, layout.x + layout.width / 2 - screenWidth / 2)
      tabRailRef.current?.scrollTo({ x: scrollX, animated: true })
    }
  }, [screenWidth, tab])

  function runningAt(col: number): RunningItem[] {
    const items: RunningItem[] = []
    for (const a of timetable.agents) {
      if (col >= a.startCol && col <= a.endCol) items.push({ id:`agent-${a.name}`, label:a.name, color:a.color })
    }
    for (const i of timetable.infusions) {
      if (col >= i.startCol && col <= i.endCol) {
        // Show the rate ACTIVE at this column, not the initial rate: apply the
        // latest rateChange at or before `col`, falling back to the base rate.
        const sorted = (i.rateChanges ?? []).slice().sort((a, b) => a.col - b.col)
        const active = sorted.filter(rc => rc.col <= col).pop()
        const curRate = active?.rate ?? i.rate
        items.push({ id:`inf-${i.id}`, label:`${i.name} ${curRate}`, color:i.color })
      }
    }
    for (const f of timetable.fluids) {
      if (col >= f.startCol && col <= f.endCol) items.push({ id:`fluid-${f.id}`, label:`${f.name} ${f.volume}mL`, color:f.color })
    }
    return items  // no cap — show all parallel infusions, fluids and agents
  }

  function vitalSummary(v?: VitalsEntry) {
    if (!v) return ""
    const parts: string[] = []
    if (v.systolic != null && v.diastolic != null) parts.push(`${v.systolic}/${v.diastolic}`)
    if (v.heartRate != null) parts.push(`HR ${v.heartRate}`)
    if (v.spO2 != null) parts.push(`SpO2 ${v.spO2}`)
    if (v.etco2 != null) parts.push(`CO2 ${v.etco2}`)
    return parts.join("  ")
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex:1, backgroundColor: colors.background }}>
        <AppHeader title="Intraoperative" showNewCase={false} />
        {caseInfo?.status === "COMPLETE" && caseInfo.finalizedAt && (
          <EditWindowBanner finalizedAt={caseInfo.finalizedAt} caseId={id} showBackButton />
        )}
        {isWatching && <WatchingOverlay onTakeover={takeover} />}

        {/* ── Monitor header ─────────────────────────────────────────── */}
        <View style={{ backgroundColor: colors.surface, paddingTop:10, paddingBottom:10,
          paddingHorizontal:16, borderBottomWidth:1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start" }}>
            <View style={{ flex:1, marginRight:12 }}>
              <Text style={{ color:colors.primary, fontSize:10, fontWeight:"700", letterSpacing:1.2, textTransform:"uppercase" }}>
                {caseInfo?.techniques?.map(techniqueLabel).join(" · ") ?? "Anaesthesia"}
              </Text>
              <Text style={{ color:colors.textPrimary, fontSize:16, fontWeight:"700", marginTop:3 }} numberOfLines={1}>
                {caseInfo?.procedure ?? "–"}
              </Text>
              {!!caseInfo?.diagnosis && (
                <Text style={{ color:colors.textSecondary, fontSize:12, marginTop:2 }} numberOfLines={1}>
                  {caseInfo.diagnosis}
                </Text>
              )}
            </View>
            <View style={{ alignItems:"flex-end", gap:4 }}>
              <Text style={{ color:colors.textPrimary, fontSize:30, fontWeight:"200", letterSpacing:1,
                fontVariant:["tabular-nums"] }}>{timeStr}</Text>
              {!startRef.current ? (
                <View style={{ flexDirection:"row", gap:6 }}>
                  <TouchableOpacity
                    onPress={startCaseNow}
                    style={{ borderRadius:10, paddingHorizontal:12, paddingVertical:5,
                      backgroundColor:"#1a1005", borderWidth:1, borderColor:"#f97316aa" }}
                  >
                    <Text style={{ color:"#fb923c", fontSize:11, fontWeight:"900" }}>Start now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const now = new Date()
                      setStartAtInput(`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`)
                      setStartAtOpen(true)
                    }}
                    style={{ borderRadius:10, paddingHorizontal:12, paddingVertical:5,
                      backgroundColor:"#0f172a", borderWidth:1, borderColor:"#6366f1aa" }}
                  >
                    <Text style={{ color:"#a5b4fc", fontSize:11, fontWeight:"900" }}>Start at…</Text>
                  </TouchableOpacity>
                </View>
              ) : elapsedMs > 60_000 ? (
                <Text style={{ color:colors.textMuted, fontSize:11 }}>+ {fmtElapsed(elapsedMs)}</Text>
              ) : null}
            </View>
          </View>
          <View style={{ marginTop:10, flexDirection:"row", alignItems:"center", justifyContent:"space-between", gap:10 }}>
            <SyncBadge
              state={syncState}
              detail={
                pendingCount > 0 ? `${pendingCount} unsynced`
                : syncState === "saved" && lastSavedAt ? `Saved ${lastSavedAt}`
                : undefined
              }
            />
            {pendingCount > 0 && (
              <TouchableOpacity
                onPress={retryPendingEvents}
                style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:10,
                  borderWidth:1, borderColor:colors.warning, backgroundColor:"#2a210f" }}>
                <Text style={{ color:colors.warning, fontSize:11, fontWeight:"800" }}>Retry sync</Text>
              </TouchableOpacity>
            )}
          </View>
          {lastVitals && (
            <View style={{ flexDirection:"row", gap:18, marginTop:10 }}>
              {lastVitals.systolic != null && lastVitals.diastolic != null && (
                <Text style={{ color:"#ef4444", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
                  {lastVitals.systolic}/{lastVitals.diastolic}
                </Text>
              )}
              {lastVitals.heartRate != null && (
                <Text style={{ color:"#22c55e", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
                  ♥ {lastVitals.heartRate}
                </Text>
              )}
              {lastVitals.spO2 != null && (
                <Text style={{ color:"#06b6d4", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
                  SpO₂ {lastVitals.spO2}%
                </Text>
              )}
              {lastVitals.etco2 != null && (
                <Text style={{ color:"#f59e0b", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
                  CO₂ {lastVitals.etco2}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* ── Case ended banner ──────────────────────────────────────── */}
        {caseEnded && (
          <View style={{ backgroundColor:"#0f2a1a", borderBottomWidth:1, borderBottomColor:"#22c55e44",
            flexDirection:"row", alignItems:"center", justifyContent:"space-between",
            paddingHorizontal:16, paddingVertical:10 }}>
            <Text style={{ color:"#22c55e", fontWeight:"800", fontSize:13 }}>{tc("caseEnded")}</Text>
            <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
              {resumeSecsLeft > 0 && (
                <TouchableOpacity onPress={resumeCase}
                  style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999,
                    borderWidth:1.5, borderColor:"#f59e0b", backgroundColor:"#1a140a" }}>
                  <Text style={{ color:"#f59e0b", fontWeight:"700", fontSize:12 }}>
                    {tc("resumeCase")} ({Math.floor(resumeSecsLeft/60)}:{String(resumeSecsLeft%60).padStart(2,"0")})
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Tab bar ────────────────────────────────────────────────── */}
        <View style={{ backgroundColor:"#0a0f1a", borderBottomWidth:1, borderBottomColor:"#1e2d40" }}>
          <ScrollView ref={tabRailRef} horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection:"row", paddingHorizontal:Math.max(0, screenWidth / 2 - 48) }}>
            {([
              ["equipment",tc("tabEquipment")],["technique",tc("tabTechnique")],["timing",tc("tabTiming")],["position",tc("tabPosition")],
              ["monitoring",tc("tabMonitoring")],["airway",tc("tabAirway")],["vascular",tc("tabVascular")],
              ["premedication",tc("tabPremedication")],["log","Timetable"],["events","Event log"],
            ] as [string,string][]).map(([t, label]) => (
              <TouchableOpacity key={t} onPress={() => setTab(t as any)}
                onLayout={(e) => { tabLayouts.current[t] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width } }}
                style={{ paddingHorizontal:16, paddingVertical:8, alignItems:"center",
                  borderBottomWidth:2, borderBottomColor: tab===t ? "#3b82f6" : "transparent" }}>
                <Text style={{ color: tab===t ? "#3b82f6" : "#64748b", fontSize:12, fontWeight:"700" }}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Tab content — swipe gesture wrapper.
            On web, PanResponder gesture handlers on a div can break the flex-1 width
            computation so fixed-padding children overflow the viewport. Explicit
            width + overflow:hidden pins the container to the actual screen width. */}
        <View style={{ flex:1, width: screenWidth, overflow: "hidden" }} {...tabSwipeResponder.panHandlers}>

        {/* ── VERTICAL TIMETABLE TAB ─────────────────────────────────── */}
        {tab === "log" && (
          <View style={{ flex:1, ...(Platform.OS === "web" ? { width: screenWidth } : {}) }}>
            {undoEv && (
              <View style={{ flexDirection:"row", alignItems:"center", gap:10,
                paddingHorizontal:12, paddingVertical:9, backgroundColor:"#17212a",
                borderBottomWidth:1, borderBottomColor:"#2a3a46" }}>
                <Text style={{ color:colors.textSecondary, fontSize:12, flex:1 }} numberOfLines={1}>
                  {eventLabel(undoEv).text} added
                </Text>
                <TouchableOpacity onPress={undoLastEvent}
                  style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8,
                    backgroundColor:colors.primarySoft, borderWidth:1, borderColor:colors.primary }}>
                  <Text style={{ color:colors.primary, fontSize:11, fontWeight:"900" }}>Undo</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setUndoEv(null)} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                  <Text style={{ color:colors.textMuted, fontSize:13, fontWeight:"800" }}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            )}

            <FlatList
              ref={verticalTimetableRef}
              data={chartRows}
              keyExtractor={col => String(col)}
              style={{ flex:1, ...(Platform.OS === "web" ? { width: screenWidth } : {}) }}
              contentContainerStyle={Platform.OS === "web" ? { width: screenWidth } : undefined}
              getItemLayout={expandedRow === null ? (_data, index) => ({ length: ROW_H, offset: ROW_H * index, index }) : undefined}
              initialNumToRender={24}
              maxToRenderPerBatch={20}
              windowSize={10}
              onScrollToIndexFailed={info => {
                const wait = new Promise(resolve => setTimeout(resolve, 100))
                wait.then(() => {
                  verticalTimetableRef.current?.scrollToIndex({ index: info.highestMeasuredFrameIndex, animated: false })
                })
              }}
              renderItem={({ item: col }) => {
                const t = timeAtCol(chartStart, col)
                const rowEvents = (eventRows[col] ?? []).slice().sort((a,b) =>
                  new Date(a.ts).getTime() - new Date(b.ts).getTime())
                const vital = timetable.vitals[col]
                const running = runningAt(col)
                const isNow = col === currentCol
                const isQuarter = col % 3 === 0
                const isExpanded = col === expandedRow

                // Smart priority summary
                const criticalParts: string[] = []
                const normalParts: string[] = []
                if (vital) {
                  if (vital.systolic != null && vital.systolic < 90)
                    criticalParts.push(`BP ${vital.systolic}/${vital.diastolic ?? "?"}`)
                  else if (vital.systolic != null)
                    normalParts.push(`${vital.systolic}/${vital.diastolic ?? "?"}`)

                  if (vital.heartRate != null && (vital.heartRate < 50 || vital.heartRate > 130))
                    criticalParts.push(`HR ${vital.heartRate}`)
                  else if (vital.heartRate != null)
                    normalParts.push(`HR ${vital.heartRate}`)

                  if (vital.spO2 != null && vital.spO2 < 95)
                    criticalParts.push(`SpO2 ${vital.spO2}`)
                  else if (vital.spO2 != null)
                    normalParts.push(`SpO2 ${vital.spO2}`)

                  if (vital.temp != null && vital.temp < 35)
                    criticalParts.push(`T ${vital.temp}`)
                  else if (vital.temp != null)
                    normalParts.push(`T ${vital.temp}`)

                  if (vital.etco2 != null) normalParts.push(`CO2 ${vital.etco2}`)
                }
                const drugParts = rowEvents
                  .filter(ev => ev.type === "drug" || ev.type === "clinical_event")
                  .slice(0, 4)
                  .map(ev => eventLabel(ev).text)
                const hasCritical = criticalParts.length > 0
                const hasUnsynced = rowEvents.some(ev => ev.syncStatus)

                // ── Expanded row ───────────────────────────────────────────
                if (isExpanded) {
                  return (
                    <View style={{
                      backgroundColor: "#0a1220",
                      borderBottomWidth: 2, borderBottomColor: "#f9731644",
                      borderTopWidth: isNow ? 1 : 0, borderTopColor: "#f9731633",
                    }}>
                      {/* Header — tap to collapse */}
                      <TouchableOpacity
                        onPress={() => setExpandedRow(null)}
                        activeOpacity={0.7}
                        style={{
                          height: ROW_H, flexDirection: "row", alignItems: "center",
                          paddingLeft: 12, paddingRight: 14,
                          borderBottomWidth: 1, borderBottomColor: "#1a2a3a",
                        }}
                      >
                        <Text style={{
                          color: "#fb923c", fontSize: 13, fontWeight: "800",
                          fontVariant: ["tabular-nums"], width: 42,
                        }}>
                          {formatDateHHMM(t)}
                        </Text>
                        <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4, paddingHorizontal: 8 }}>
                          {vital && (
                            <View style={{ backgroundColor: "#1a3028", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ color: hasCritical ? "#ef4444" : "#22c55e", fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                                {criticalParts.length > 0 ? criticalParts.join("  ") : normalParts.slice(0, 2).join("  ")}
                              </Text>
                            </View>
                          )}
                          {rowEvents.filter(ev => ev.type === "drug" || ev.type === "clinical_event").slice(0, 4).map(ev => (
                            <View key={ev.id} style={{
                              backgroundColor: (ev.color ?? "#3b82f6") + "22",
                              borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
                              borderWidth: 1, borderColor: (ev.color ?? "#3b82f6") + "55",
                            }}>
                              <Text style={{ color: ev.color ?? "#3b82f6", fontSize: 11, fontWeight: "600" }}>
                                {eventLabel(ev).text}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <Text style={{ color: "#475569", fontSize: 18, fontWeight: "300" }}>×</Text>
                      </TouchableOpacity>

                      {/* Running items */}
                      {running.length > 0 && (
                        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
                          <Text style={{
                            color: "#475569", fontSize: 10, fontWeight: "700",
                            letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 8,
                          }}>Running</Text>
                          <View style={{ gap: 7 }}>
                            {running.map(item => {
                              const activeInf = activeInfusions.find(i => item.id === `inf-${i.infId}`)
                              const activeFl  = activeFluids.find(f => item.id === `fluid-${f.fluidId}`)
                              const isAgentItem = item.id.startsWith("agent-")
                              const canManage = !!(activeInf || activeFl || (isAgentItem && activeAgent))
                              return (
                                <TouchableOpacity
                                  key={item.id}
                                  activeOpacity={canManage ? 0.7 : 1}
                                  onPress={() => {
                                    if (activeInf) { setInfActTgt(activeInf); setInfActRate(activeInf.rate); setInfActOpen(true) }
                                    else if (activeFl) { openFluidEnd(activeFl) }
                                    else if (isAgentItem && activeAgent) {
                                      Alert.alert(`Stop ${activeAgent.name}?`, undefined, [
                                        { text: tc("cancelLabel"), style: "cancel" },
                                        { text: "Stop", style: "destructive", onPress: stopAgent },
                                      ])
                                    }
                                  }}
                                  style={{
                                    flexDirection: "row", alignItems: "center",
                                    backgroundColor: item.color + "14",
                                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
                                    borderWidth: 1, borderColor: item.color + "44",
                                    borderLeftWidth: 4, borderLeftColor: item.color,
                                  }}
                                >
                                  <Text style={{ color: item.color, fontSize: 13, fontWeight: "700", flex: 1 }}>
                                    {item.label}
                                  </Text>
                                  {canManage && (
                                    <Text style={{ color: "#64748b", fontSize: 11 }}>
                                      {activeInf ? "Manage" : activeFl ? "End fluid" : "Stop"} →
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              )
                            })}
                          </View>
                        </View>
                      )}

                      {/* Quick-add grid */}
                      <View style={{ paddingHorizontal: 14, paddingTop: running.length > 0 ? 4 : 12, paddingBottom: 16 }}>
                        <Text style={{
                          color: "#475569", fontSize: 10, fontWeight: "700",
                          letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 10,
                        }}>Add now</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                          {([
                            { label: "Vitals",   action: "vital"    as const, color: "#22c55e" },
                            { label: "Drug",     action: "drug"     as const, color: "#3b82f6" },
                            { label: "Infusion", action: "infusion" as const, color: "#a855f7" },
                            { label: "Fluid",    action: "fluid"    as const, color: "#06b6d4" },
                            { label: "Agent",    action: "agent"    as const, color: "#f59e0b" },
                            { label: activeGas ? "Gas" : "FGF", action: "gas" as const, color: "#818cf8" },
                            { label: "Event",    action: "event"    as const, color: "#6366f1" },
                          ]).map(btn => (
                            <TouchableOpacity
                              key={btn.action}
                              onPress={() => openRowQuickAdd(col, btn.action)}
                              style={{
                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                                backgroundColor: btn.color + "18",
                                borderWidth: 1, borderColor: btn.color + "44",
                              }}
                            >
                              <Text style={{ color: btn.color, fontSize: 12, fontWeight: "700" }}>
                                {btn.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>
                  )
                }

                // ── Collapsed row ──────────────────────────────────────────
                return (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setExpandedRow(col)}
                    style={{
                      height: ROW_H,
                      flexDirection: "row",
                      alignItems: "stretch",
                      position: "relative",
                      borderBottomWidth: 1,
                      borderBottomColor: isNow ? "#f9731633" : isQuarter ? "#1e2d40" : "#0f1826",
                      backgroundColor: isNow ? "rgba(249,115,22,0.035)" : "transparent",
                    }}
                  >
                    {/* Now line at exact fractional position within this row */}
                    {isNow && (
                      <View
                        pointerEvents="none"
                        style={{
                          position: "absolute", left: 0, right: 0,
                          top: (nowSlotPercent / 100) * ROW_H - 1,
                          height: 2,
                          backgroundColor: "#f97316",
                          zIndex: 20,
                          boxShadow: "0 0 10px rgba(249,115,22,0.85)",
                        }}
                      />
                    )}

                    {/* Time label */}
                    <View style={{ width: 54, alignItems: "flex-end", paddingRight: 8, justifyContent: "center" }}>
                      <Text style={{
                        color: isNow ? "#fb923c" : isQuarter ? "#cbd5e1" : "#475569",
                        fontSize: isNow || isQuarter ? 12 : 11,
                        fontWeight: isNow || isQuarter ? "700" : "500",
                        fontVariant: ["tabular-nums"],
                      }}>
                        {formatDateHHMM(t)}
                      </Text>
                    </View>

                    {/* Timeline spine + dot */}
                    <View style={{ width: 18, alignItems: "center" }}>
                      <View style={{ position: "absolute", top: 0, bottom: 0, width: 1.5, backgroundColor: "#1a2540" }} />
                      <View style={{
                        marginTop: ROW_H / 2 - 4,
                        width: vital ? 9 : 6,
                        height: vital ? 9 : 6,
                        borderRadius: 8,
                        backgroundColor: hasCritical ? "#ef4444" : vital ? "#22c55e" : isQuarter ? "#2d3e55" : "#151f30",
                        borderWidth: isNow ? 2 : 0,
                        borderColor: "#f97316",
                      }} />
                    </View>

                    {/* Content — priority summary */}
                    <View style={{ flex: 1, justifyContent: "center", paddingLeft: 6, paddingRight: 4 }}>
                      {hasCritical && (
                        <Text style={{
                          color: "#ef4444", fontSize: 12, fontWeight: "800",
                          fontVariant: ["tabular-nums"], lineHeight: 16,
                        }} numberOfLines={1}>
                          {criticalParts.join("  ")}
                        </Text>
                      )}
                      {normalParts.length > 0 && (
                        <Text style={{
                          color: hasCritical ? "#64748b" : "#94a3b8",
                          fontSize: hasCritical ? 10 : 12,
                          fontVariant: ["tabular-nums"],
                          lineHeight: hasCritical ? 14 : 16,
                        }} numberOfLines={1}>
                          {normalParts.join("  ")}
                        </Text>
                      )}
                      {drugParts.length > 0 && (
                        <Text style={{ color: "#4a5c6e", fontSize: 10, lineHeight: 13 }} numberOfLines={1}>
                          {drugParts.join("  ·  ")}
                        </Text>
                      )}
                      {hasUnsynced && (
                        <Text style={{ color: colors.warning, fontSize: 9, fontWeight: "800", lineHeight: 12 }}>
                          unsynced
                        </Text>
                      )}
                    </View>

                    {/* Running strips — full height, stacked from right edge inward (5px each) */}
                    <View style={{ flexDirection: "row", alignSelf: "stretch" }}>
                      {running.slice().reverse().map(item => (
                        <View key={item.id} style={{ width: 5, backgroundColor: item.color + "88" }} />
                      ))}
                    </View>
                  </TouchableOpacity>
                )
              }}
            />

            {/* Footer: Now + End case */}
            <View style={{
              flexDirection: "row", gap: 10,
              paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 16,
              backgroundColor: "#070c14", borderTopWidth: 1, borderTopColor: "#0f172a",
            }}>
              <TouchableOpacity
                onPress={jumpVerticalTimetableToNow}
                disabled={!startRef.current}
                style={{
                  flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center",
                  backgroundColor: "#0f1828",
                  borderWidth: 1, borderColor: "#f9731655",
                  opacity: startRef.current ? 1 : 0.35,
                }}
              >
                <Text style={{ color: "#fb923c", fontSize: 13, fontWeight: "800" }}>↓ Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (!isWatching) openEndCase() }}
                disabled={isWatching}
                style={{
                  flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center",
                  backgroundColor: "#1a1005", borderWidth: 1, borderColor: "#f9731644",
                  opacity: isWatching ? 0.4 : 1,
                }}
              >
                <Text style={{ color: "#fb923c", fontSize: 13, fontWeight: "800" }}>End case</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── EQUIPMENT TAB ──────────────────────────────────────────── */}
        {tab === "equipment" && <EquipmentTab preop={preop} />}

        {/* ── TECHNIQUE TAB ──────────────────────────────────────────── */}
        {tab === "technique" && (
          <TechniqueTab
            techPath={techPath} setTechPath={setTechPath} techniqueTree={TECHNIQUE_TREE}
            techniques={techniques} setTechniques={setTechniques} saveTechniques={saveTechniques}
            techniqueColor={techniqueColor} techniqueLabel={techniqueLabel}
            otherTechText={otherTechText} setOtherTechText={setOtherTechText} tc={tc}
          />
        )}

        {/* ── TIMING TAB ─────────────────────────────────────────────── */}
        {tab === "timing" && (
          <TimingTab
            caseMonthYear={caseMonthYear} setCaseMonthYear={setCaseMonthYear}
            caseStartTime={caseStartTime} setCaseStartTime={setCaseStartTime}
            caseEndTime={caseEndTime} setCaseEndTime={setCaseEndTime}
            caseEndNextDay={caseEndNextDay} setCaseEndNextDay={setCaseEndNextDay}
            timingSaving={timingSaving} saveTiming={saveTiming} startRef={startRef} tc={tc}
          />
        )}

        {/* ── POSITION TAB ───────────────────────────────────────────── */}
        {tab === "position" && (
          <PositionTab positions={positions} setPositions={setPositions} savePositions={savePositions}
            fieldSaving={fieldSaving} positionsList={POSITIONS_LIST} />
        )}

        {/* ── MONITORING TAB ─────────────────────────────────────────── */}
        {tab === "monitoring" && (
          <MonitoringTab monitoring={monitoring} setMonitoring={setMonitoring} saveMonitoring={saveMonitoring}
            fieldSaving={fieldSaving} monitoringOpts={MONITORING_OPTS} advMonOpen={advMonOpen} setAdvMonOpen={setAdvMonOpen} />
        )}

        {/* ── AIRWAY TAB ─────────────────────────────────────────────── */}
        {tab === "airway" && (
          <AirwayTab
            awTools={awTools} setAwTools={setAwTools} awClGrade={awClGrade} setAwClGrade={setAwClGrade}
            awDevices={awDevices} setAwDevices={setAwDevices}
            awLmaSize={awLmaSize} setAwLmaSize={setAwLmaSize}
            awOralTubeSize={awOralTubeSize} setAwOralTubeSize={setAwOralTubeSize}
            awOralCuffed={awOralCuffed} setAwOralCuffed={setAwOralCuffed}
            awNasalTubeSize={awNasalTubeSize} setAwNasalTubeSize={setAwNasalTubeSize}
            awNasalCuffed={awNasalCuffed} setAwNasalCuffed={setAwNasalCuffed}
            awDltType={awDltType} setAwDltType={setAwDltType} awDltSide={awDltSide} setAwDltSide={setAwDltSide}
            awDltSize={awDltSize} setAwDltSize={setAwDltSize}
            awEbSize={awEbSize} setAwEbSize={setAwEbSize} awVentModes={awVentModes} setAwVentModes={setAwVentModes}
            awNotes={awNotes} setAwNotes={setAwNotes}
            saveAirwaySection={saveAirwaySection} awExpandedDevice={awExpandedDevice} setAwExpandedDevice={setAwExpandedDevice}
            awExpandedWasComplete={awExpandedWasComplete}
            airwayTools={AIRWAY_TOOLS} airwayDevices={AIRWAY_DEVICES}
            awVentExpanded={awVentExpanded} setAwVentExpanded={setAwVentExpanded}
          />
        )}

        {/* ── VASCULAR ACCESS TAB ────────────────────────────────────── */}
        {tab === "vascular" && (
          <VascularTab
            vascularAccesses={vascularAccesses} setVascularAccesses={setVascularAccesses}
            saveVascularAccesses={saveVascularAccesses} vascularSaving={vascularSaving}
            vascSiteColor={vascSiteColor} vascTree={VASC_TREE} vascDefaultUnit={vascDefaultUnit}
            vascPreexistingQuick={VASC_PREEXISTING_QUICK} tc={tc}
          />
        )}

        {/* ── PREMEDICATION TAB ──────────────────────────────────────── */}
        {tab === "premedication" && (
          <PremedicationTab
            premedEveningText={premedEveningText} setPremedEveningText={setPremedEveningText}
            premedMorningText={premedMorningText} setPremedMorningText={setPremedMorningText}
            savePremedication={savePremedication} tc={tc} openPremedPicker={openPremedPicker}
          />
        )}

        {/* ── EVENT LOG TAB (formerly "timeline") ────────────────────── */}
        {tab === "events" && (
          <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>

            {/* ── Event log ─────────────────────────────────────────── */}
            <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
              textTransform:"uppercase", marginBottom:10 }}>Event log</Text>
            {log.length === 0 ? (
              <View style={{ alignItems:"center", paddingTop:40, paddingBottom:20 }}>
                <Text style={{ color:"#475569", fontSize:14 }}>No events recorded yet.</Text>
              </View>
            ) : log.map((ev, idx) => {
              const prev = ev.type === "vital" ? prevVitalFor(idx) : undefined
              const { text, color, sub } = eventLabel(ev, prev)
              return (
                <TouchableOpacity key={ev.id}
                  onLongPress={() => eventActions(ev)}
                  style={{ flexDirection:"row", alignItems:"center", paddingVertical:11,
                    borderBottomWidth:1, borderBottomColor:"#1a2030" }}>
                  <Text style={{ color:"#64748b", fontSize:11, width:42,
                    fontVariant:["tabular-nums"] }}>{formatTs(ev.ts)}</Text>
                  <View style={{ width:3, height:36, borderRadius:2, backgroundColor:color, marginHorizontal:12 }} />
                  <View style={{ flex:1 }}>
                    <Text style={{ color:"#e2e8f0", fontSize:13, fontWeight:"600" }}>{text}</Text>
                    {!!sub && <Text style={{ color:"#94a3b8", fontSize:11, marginTop:1 }}>{sub}</Text>}
                  </View>
                  <Pressable
                    onPress={() => promptDelete(ev)}
                    hitSlop={12}
                    style={{ paddingHorizontal:8, paddingVertical:4 }}
                  >
                    <Text style={{ color:"#475569", fontSize:18, fontWeight:"300" }}>×</Text>
                  </Pressable>
                </TouchableOpacity>
              )
            })}

            {/* Divider */}
            <View style={{ height:1, backgroundColor:"#1a2030", marginTop:16, marginBottom:16 }} />

            {/* ── Complications section ──────────────────────────────── */}
            <View style={{ marginBottom:8 }}>
              <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
                marginBottom:10 }}>
                <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
                  textTransform:"uppercase" }}>Complications</Text>
                <View style={{ flexDirection:"row", gap:8, alignItems:"center" }}>
                  {selectedComplications.length > 0 && (
                    <View style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:8,
                      backgroundColor:"#ef444422", borderWidth:1, borderColor:"#ef444455" }}>
                      <Text style={{ color:"#f87171", fontSize:11, fontWeight:"700" }}>
                        {selectedComplications.length} selected
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => setCompOpen(true)}
                    style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8,
                      backgroundColor:"#1e2030", borderWidth:1, borderColor:"#ef444444" }}>
                    <Text style={{ color:"#f87171", fontSize:11, fontWeight:"700" }}>
                      {selectedComplications.length > 0 ? `${selectedComplications.length} selected →` : "+ Add complication"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {selectedComplications.length > 0 && (
                <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                  {selectedComplications.map(comp => (
                    <View key={comp} style={{ paddingHorizontal:8, paddingVertical:5, borderRadius:8,
                      backgroundColor:"#ef444418", borderWidth:1, borderColor:"#ef444455" }}>
                      <Text style={{ color:"#fca5a5", fontSize:11, fontWeight:"600" }}>{comp}</Text>
                    </View>
                  ))}
                </View>
              )}
              <TextInput
                style={{ backgroundColor:"#111111", color:"#e2e8f0", borderRadius:10, padding:11,
                  fontSize:13, borderWidth:1, borderColor:"#2a2030", minHeight:44 }}
                placeholder="Additional notes (optional)"
                placeholderTextColor="#3e3e4e"
                multiline
                maxLength={500}
                value={complicationsNotes}
                onChangeText={setComplicationsNotes}
                onBlur={() => { if (buildComplicationsString() !== null) saveComplications() }}
              />
            </View>

          </ScrollView>
        )}

        {/* ── CHART TAB (kept for internal use but no tab button) ─────── */}
        {tab === ("chart" as any) && (() => {
          const PAGE_COLS  = 12
          const totalPages = Math.ceil(ttColCount / PAGE_COLS)
          const safePage   = Math.min(chartPage, totalPages - 1)
          const offset     = safePage * PAGE_COLS
          function pageLabel() {
            const h0 = (startRef.current ? startRef.current.getHours() * 60 + startRef.current.getMinutes() : 480) + offset * 5
            const h1 = h0 + PAGE_COLS * 5
            const fmt = (m: number) => `${String(Math.floor(m/60)%24).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`
            return `${fmt(h0)}–${fmt(h1)}`
          }
          return (
            <View style={{ flex:1 }}>
              <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
                paddingHorizontal:14, paddingVertical:8, backgroundColor:"#0a0f1a",
                borderBottomWidth:1, borderBottomColor:"#1e2d40" }}>
                <TouchableOpacity onPress={() => setChartPage(p => Math.max(0, p-1))}
                  disabled={safePage === 0} style={{ padding:8 }}>
                  <Text style={{ color: safePage===0 ? "#1e2d40" : "#94a3b8", fontSize:18 }}>←</Text>
                </TouchableOpacity>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"600" }}>
                  Hour {safePage+1}  {pageLabel()}
                </Text>
                <TouchableOpacity onPress={() => {
                    if (safePage < totalPages - 1) setChartPage(p => p+1)
                    else { setTtColCount(c => c + PAGE_COLS); setChartPage(totalPages) }
                  }} style={{ padding:8 }}>
                  <Text style={{ color:"#94a3b8", fontSize:18 }}>→</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection:"row", justifyContent:"flex-end",
                paddingHorizontal:14, paddingVertical:6, backgroundColor:"#0a0f1a" }}>
                <TouchableOpacity onPress={() => setChartPage(totalPages - 1)}
                  style={{ paddingHorizontal:10, paddingVertical:4, borderRadius:6,
                    backgroundColor:"#1e3a5f", borderWidth:1, borderColor:"#3b82f644" }}>
                  <Text style={{ color:"#93c5fd", fontSize:11 }}>Jump to now</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:12 }}>
                <IntraopTimetable
                  startTime={startRef.current
                    ? `${String(startRef.current.getHours()).padStart(2,"0")}:${String(startRef.current.getMinutes()).padStart(2,"0")}`
                    : "08:00"}
                  colCount={PAGE_COLS}
                  colOffset={offset}
                  onColCountChange={n => setTtColCount(offset + n)}
                  data={timetable}
                  onChange={(newData) => {
                    // Detect fluids added via the timetable component's own modal
                    // (time-cell-tap → add modal → fluid tab). These bypass the event
                    // log so we intercept and generate fluid_start events for them,
                    // ensuring they survive the next eventsToTimetable rebuild.
                    if (startRef.current) {
                      const prevIds = new Set(timetable.fluids.map(f => f.id))
                      const base = roundDown5Min(startRef.current)
                      for (const fl of newData.fluids) {
                        if (prevIds.has(fl.id)) continue
                        // New fluid — create a fluid_start event at its startCol time
                        const ts = new Date(base.getTime() + fl.startCol * 5 * 60_000).toISOString()
                        const ev: LogEvent = { id: uid(), ts, type: "fluid_start", fluidId: fl.id, name: fl.name, volume: fl.volume, color: fl.color, syncStatus: "pending" }
                        const newLog = [ev, ...log]
                        setLog(newLog)
                        setActiveFluids(prev => [...prev, { fluidId: fl.id, name: fl.name, volume: fl.volume, color: fl.color }])
                        storePendingEvents(id, newLog.filter(e => e.syncStatus === "pending")).catch(() => {})
                        apiFetch(`/api/cases/${id}/events`, {
                          method:"POST",
                          headers: {
                            "X-Idempotency-Key": `${id}:${ev.id}`,
                            "X-Lospor-Source": "mobile",
                          },
                          body: JSON.stringify(eventForServer(ev)),
                        })
                          .then(res => res.ok ? res.json().catch(() => ({} as { intraopUpdatedAt?: string })) : {} as { intraopUpdatedAt?: string })
                          .then(body => { baseIntraopUpdatedAtRef.current = body?.intraopUpdatedAt ?? baseIntraopUpdatedAtRef.current })
                          .catch(() => {})
                      }
                    }
                    setTimetable(newData)
                  }}
                  showActions={false}
                  endTime={caseEnded || caseEndTime ? caseEndTime : undefined}
                  onResumeCase={resumeSecsLeft > 0 ? resumeCase : undefined}
                  onInfusionBarTap={(infId, col) => {
                    // Set entryTs to this column's time so the rate change is recorded
                    // at the tapped column rather than the current wall-clock time
                    const base = startRef.current ?? new Date()
                    const ts = timeAtCol(base, col).toISOString()
                    setEntryTs(ts)
                    const activeInf = activeInfusions.find(x => x.infId === infId)
                    if (activeInf) { setInfActTgt(activeInf); setInfActRate(""); setInfActOpen(true) }
                  }}
                />
              </ScrollView>
            </View>
          )
        })()}

        </View>{/* end tab content gesture wrapper */}

        {/* ── Slot action sheet (tiered: Vitals → Events → Drugs → Infusions → Fluids → Agent) ── */}
        <Sheet visible={slotOpen} onClose={() => { setSlotOpen(false); setSlotEventSearch(""); setSlotCompExpanded(false) }}
          title={`${slotTs ? formatDateHHMM(slotTs) : timeStr}`} full>

          {/* ── Event search ── */}
          <TextInput
            style={{ backgroundColor:"#111820", color:"#f8fafc", borderRadius:10, paddingHorizontal:12, paddingVertical:9,
              fontSize:13, borderWidth:1, borderColor:"#1e2d40", marginBottom:12 }}
            placeholder="Search events…" placeholderTextColor="#475569"
            value={slotEventSearch} onChangeText={setSlotEventSearch}
            autoCapitalize="none" autoCorrect={false}
          />

          {/* ── Events ── */}
          {CLINICAL_EVENT_CATS.map(cat => {
            const visibleEvents = cat.isComplication
              ? (slotCompExpanded
                  ? [...cat.events, ...COMPLICATION_GROUPS.flatMap(g => g.items).filter(label => !cat.events.some(e => e.label === label)).map(label => ({ label, color: "#ef4444" }))]
                  : cat.events
                ).filter(ev => !slotEventSearch || ev.label.toLowerCase().includes(slotEventSearch.toLowerCase()))
              : cat.events.filter(ev => !slotEventSearch || ev.label.toLowerCase().includes(slotEventSearch.toLowerCase()))
            if (visibleEvents.length === 0 && slotEventSearch) return null
            return (
              <View key={cat.cat} style={{ marginBottom:14 }}>
                <View style={{ flexDirection:"row", alignItems:"center", marginBottom:6 }}>
                  <Text style={{ color: cat.color, fontSize:9, fontWeight:"800", letterSpacing:1.2,
                    textTransform:"uppercase", flex:1 }}>{cat.cat}</Text>
                  {cat.isComplication && (
                    <TouchableOpacity onPress={() => setSlotCompExpanded(v => !v)}>
                      <Text style={{ color:"#64748b", fontSize:9, fontWeight:"700" }}>{slotCompExpanded ? "Show less" : "Show all"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection:"row", flexWrap:"wrap", gap:7 }}>
                  {visibleEvents.map(ev => (
                    <TouchableOpacity key={ev.label} onPress={() => openSlotEvent(ev, cat.isComplication ?? false)}
                      style={{ paddingHorizontal:11, paddingVertical:8, borderRadius:10,
                        backgroundColor:ev.color+"18", borderWidth:1, borderColor:ev.color+"55" }}>
                      <Text style={{ color:ev.color, fontSize:11, fontWeight:"700" }}>{ev.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )
          })}

          {/* ── Drugs/Infusions/Fluids sections removed — accessible via timetable row actions ── */}
          {false && favDrugs.length > 0 && (
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:10 }}>
              {favDrugs.map(d => (
                <TouchableOpacity key={d.name}
                  onPress={() => { setSlotOpen(false); setEntryTs(slotIso() ?? null); setDrugCat(d.catObj as any); setDrugPick(d); setDrugDose(""); setDrugOpen(true) }}
                  style={{ paddingHorizontal:12, paddingVertical:9, borderRadius:10,
                    backgroundColor:d.color+"1a", borderWidth:1, borderColor:d.color+"55" }}>
                  <Text style={{ color:d.color, fontWeight:"700", fontSize:12 }}>{d.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity onPress={() => { const ts = slotIso(); setSlotOpen(false); openDrug(ts) }}
            style={{ borderRadius:10, paddingVertical:10, alignItems:"center",
              backgroundColor:"#1e2d40", borderWidth:1, borderColor:"#3b82f644", marginBottom:18 }}>
            <Text style={{ color:"#93c5fd", fontWeight:"700", fontSize:12 }}>Browse all drugs →</Text>
          </TouchableOpacity>

          {/* ── Inhaled Agent (GA only) ── */}
          {isGACase && (
            <>
              <Text style={{ color:"#a855f7", fontSize:10, fontWeight:"800", letterSpacing:1.2,
                textTransform:"uppercase", marginBottom:8 }}>Inhaled Agent</Text>
              {activeAgent ? (
                <View style={{ flexDirection:"row", gap:8, marginBottom:8 }}>
                  <View style={{ flex:1, borderRadius:10, paddingVertical:10, paddingHorizontal:12,
                    backgroundColor:activeAgent.color+"18", borderWidth:1, borderColor:activeAgent.color+"55" }}>
                    <Text style={{ color:activeAgent.color, fontWeight:"700" }}>{activeAgent.name} running</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setSlotOpen(false); stopAgent() }}
                    style={{ borderRadius:10, paddingHorizontal:14, paddingVertical:10,
                      backgroundColor:"#1e1010", borderWidth:1, borderColor:"#ef444444" }}>
                    <Text style={{ color:"#ef4444", fontWeight:"700", fontSize:12 }}>Stop</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity onPress={() => { const ts = slotIso(); setSlotOpen(false); openAgent(ts) }}
                style={{ borderRadius:10, paddingVertical:10, alignItems:"center",
                  backgroundColor:"#1a1030", borderWidth:1, borderColor:"#a855f744" }}>
                <Text style={{ color:"#d8b4fe", fontWeight:"700", fontSize:12 }}>
                  {activeAgent ? "Switch agent →" : "Start agent →"}
                </Text>
              </TouchableOpacity>

              {/* ── Gas Settings (GA only) — pill buttons visible once GA is selected, manual start ── */}
              <Text style={{ color:"#6366f1", fontSize:10, fontWeight:"800", letterSpacing:1.2,
                textTransform:"uppercase", marginTop:16, marginBottom:8 }}>Gas Settings</Text>
              {activeGas ? (
                <View style={{ flexDirection:"row", gap:8, marginBottom:8 }}>
                  <View style={{ flex:1, borderRadius:10, paddingVertical:10, paddingHorizontal:12,
                    backgroundColor:"#6366f118", borderWidth:1, borderColor:"#6366f155" }}>
                    <Text style={{ color:"#a5b4fc", fontWeight:"700", fontSize:12 }}>
                      FGF {activeGas.fgf}L/min{activeGas.carrierGas ? ` · ${activeGas.carrierGas.toUpperCase()}` : ""} · FiO2 {activeGas.fio2}%
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => { setSlotOpen(false); stopGasSettings() }}
                    style={{ borderRadius:10, paddingHorizontal:14, paddingVertical:10,
                      backgroundColor:"#1e1010", borderWidth:1, borderColor:"#ef444444" }}>
                    <Text style={{ color:"#ef4444", fontWeight:"700", fontSize:12 }}>Stop</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity onPress={() => { const ts = slotIso(); setSlotOpen(false); openGasSettings(ts) }}
                style={{ borderRadius:10, paddingVertical:10, alignItems:"center",
                  backgroundColor:"#1a1a30", borderWidth:1, borderColor:"#6366f144" }}>
                <Text style={{ color:"#a5b4fc", fontWeight:"700", fontSize:12 }}>
                  {activeGas ? "Edit gas settings →" : "Start gas settings →"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Sheet>

        {/* ── GAS SETTINGS SHEET ───────────────────────────────────────── */}
        <Sheet visible={gasOpen} onClose={() => setGasOpen(false)} title={activeGas ? "Edit gas settings" : "Start gas settings"}>
          <View style={{ gap: 16 }}>
            <View>
              <View style={{ flexDirection:"row", justifyContent:"space-between", marginBottom:8 }}>
                <Text style={{ color:"#94a3b8", fontSize:12, fontWeight:"700" }}>FGF</Text>
                <Text style={{ color:"#a5b4fc", fontWeight:"700" }}>{gasFgf} L/min</Text>
              </View>
              <VitalStepper value={gasFgf} onChange={v => setGasFgf(v ?? 0)} min={0} max={10} step={0.5} precision={1} unit="L/min" />
            </View>
            <View>
              <Text style={{ color:"#94a3b8", fontSize:12, fontWeight:"700", marginBottom:8 }}>Carrier gas</Text>
              <View style={{ flexDirection:"row", gap:8 }}>
                {([{ key: null, label: "O2 only" }, { key: "air", label: "+ Air" }, { key: "n2o", label: "+ N2O" }] as const).map(g => (
                  <TouchableOpacity key={g.label} onPress={() => setGasCarrierGas(g.key)}
                    style={{ flex:1, paddingVertical:11, borderRadius:10, alignItems:"center", borderWidth:1.5,
                      borderColor: gasCarrierGas === g.key ? "#6366f1" : "#1e2d40",
                      backgroundColor: gasCarrierGas === g.key ? "#4338ca" : "#111111" }}>
                    <Text style={{ color: gasCarrierGas === g.key ? "#fff" : "#64748b", fontSize:13, fontWeight:"800" }}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View>
              <View style={{ flexDirection:"row", justifyContent:"space-between", marginBottom:8 }}>
                <Text style={{ color:"#94a3b8", fontSize:12, fontWeight:"700" }}>FiO2</Text>
                <Text style={{ color:"#a5b4fc", fontWeight:"700" }}>{gasFio2}%</Text>
              </View>
              <VitalStepper value={gasCarrierGas == null ? 100 : gasFio2} onChange={v => setGasFio2(v ?? 21)} min={21} max={100} step={1} unit="%" disabled={gasCarrierGas == null} />
            </View>
            <TouchableOpacity onPress={confirmGasSettings}
              style={{ backgroundColor:"#6366f1", borderRadius:12, padding:16, alignItems:"center" }}>
              <Text style={{ color:"#fff", fontWeight:"700" }}>{activeGas ? "Apply" : "Start"}</Text>
            </TouchableOpacity>
          </View>
        </Sheet>

        <DrugSheet
          visible={drugOpen}
          onClose={() => setDrugOpen(false)}
          drugCats={DRUG_CATS}
          favDrugs={favDrugs}
          drugCat={drugCat}
          setDrugCat={setDrugCat}
          drugPick={drugPick}
          setDrugPick={setDrugPick}
          drugDose={drugDose}
          setDrugDose={setDrugDose}
          dosePresets={DRUG_QUICK_DOSES}
          ranges={DRUG_RANGES}
          canStartAsInfusion={!!drugPick && INF_DRUGS.some(d => d.name === drugPick.name)}
          onConfirm={confirmDrug}
          onStartAsInfusion={startDrugAsInfusion}
          routes={DRUG_ROUTES}
          drugRoute={drugRoute}
          setDrugRoute={setDrugRoute}
          laConcentrations={DRUG_LA_CONCENTRATIONS}
          drugConcentration={drugConcentration}
          setDrugConcentration={setDrugConcentration}
        />

        {/* ── VITALS SHEET ─────────────────────────────────────────────── */}
        <Sheet visible={vitOpen} onClose={() => { setVitOpen(false); setEditingVitalId(null) }} title={vitMode==="bp" ? "Blood pressure" : editingVitalId ? "Change vitals" : "Vitals"} full>
          {/* Camera scan button */}
          <TouchableOpacity
            onPress={scanVitalsFromCamera}
            disabled={vitScanBusy}
            style={{ flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8,
              paddingVertical:10, paddingHorizontal:16, borderRadius:12, marginBottom:16,
              backgroundColor: vitScanBusy ? "#1e2d40" : "#0f2a1a",
              borderWidth:1, borderColor: vitScanBusy ? "#2a3a50" : "#22c55e55" }}>
            <Text style={{ fontSize:16 }}>📷</Text>
            <Text style={{ color: vitScanBusy ? "#64748b" : "#86efac", fontSize:13, fontWeight:"700" }}>
              {vitScanBusy ? "Reading monitor…" : "Scan monitor screen"}
            </Text>
          </TouchableOpacity>
          {/* GDPR note — image sent to Mistral EU */}
          {!vitScanBusy && (
            <Text style={{ color:"#475569", fontSize:10, marginBottom:14, lineHeight:14 }}>
              Monitor images are sent to Mistral AI (EU-hosted) for extraction only and are not stored. Do not capture patient names or identifiers.
            </Text>
          )}
          <Text style={{ color:"#ef4444", fontSize:11, fontWeight:"700", letterSpacing:1,
            textTransform:"uppercase", marginBottom:8 }}>Blood Pressure</Text>
          <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
            <TextInput
              style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#ef4444", borderRadius:12,
                padding: Platform.OS === "web" ? 10 : 14,
                fontSize: Platform.OS === "web" ? 20 : 30,
                fontWeight:"700", borderWidth:1, borderColor:"#ef444444", textAlign:"center" }}
              placeholder="Sys" placeholderTextColor="#3e3e3e"
              ref={vSysRef}
              keyboardType="number-pad" value={vSys} onChangeText={v => setAndAdvance(v, setVSys, vDiaRef)}
            />
            <Text style={{ color:"#475569", fontSize: Platform.OS === "web" ? 20 : 28, alignSelf:"center", fontWeight:"200" }}>/</Text>
            <TextInput
              style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#f87171", borderRadius:12,
                padding: Platform.OS === "web" ? 10 : 14,
                fontSize: Platform.OS === "web" ? 20 : 30,
                fontWeight:"700", borderWidth:1, borderColor:"#ef444433", textAlign:"center" }}
              placeholder="Dia" placeholderTextColor="#3e3e3e"
              ref={vDiaRef}
              keyboardType="number-pad" value={vDia} onChangeText={v => setAndAdvance(v, setVDia, vHRRef, 2)}
            />
          </View>

          {vitMode === "full" && (
            <>
              <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
                <View style={{ flex:1, minWidth:0 }}>
                  <Text style={{ color:"#22c55e", fontSize:11, fontWeight:"700", marginBottom:6 }}>HEART RATE</Text>
                  <TextInput
                    style={{ backgroundColor:"#111111", color:"#22c55e", borderRadius:10,
                      padding: Platform.OS === "web" ? 9 : 12,
                      fontSize: Platform.OS === "web" ? 18 : 24,
                      fontWeight:"700", borderWidth:1, borderColor:"#22c55e33", textAlign:"center" }}
                    placeholder="—" placeholderTextColor="#3e3e3e"
                    ref={vHRRef}
                    keyboardType="number-pad" value={vHR} onChangeText={v => setAndAdvance(v, setVHR, vSpO2Ref)}
                  />
                </View>
                <View style={{ flex:1, minWidth:0 }}>
                  <Text style={{ color:"#06b6d4", fontSize:11, fontWeight:"700", marginBottom:6 }}>SPO₂ %</Text>
                  <TextInput
                    style={{ backgroundColor:"#111111", color:"#06b6d4", borderRadius:10,
                      padding: Platform.OS === "web" ? 9 : 12,
                      fontSize: Platform.OS === "web" ? 18 : 24,
                      fontWeight:"700", borderWidth:1, borderColor:"#06b6d433", textAlign:"center" }}
                    placeholder="—" placeholderTextColor="#3e3e3e"
                    ref={vSpO2Ref}
                    keyboardType="number-pad" value={vSpO2} onChangeText={v => setAndAdvance(v, setVSpO2, (isGACase || monitoring.some(m => m.includes("EtCO₂"))) ? vEtco2Ref : monitoring.some(m => m.includes("Temperature")) ? vTempRef : undefined)}
                  />
                </View>
              </View>

              {(isGACase || monitoring.some(m => m.includes("EtCO₂"))) && (
                <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
                  <View style={{ flex:1, minWidth:0 }}>
                    <Text style={{ color:"#f59e0b", fontSize:11, fontWeight:"700", marginBottom:6 }}>ETCO₂</Text>
                    <TextInput
                      style={{ backgroundColor:"#111111", color:"#f59e0b", borderRadius:10,
                        padding: Platform.OS === "web" ? 8 : 10,
                        fontSize: Platform.OS === "web" ? 16 : 20,
                        fontWeight:"600", borderWidth:1, borderColor:"#f59e0b33", textAlign:"center" }}
                      placeholder="—" placeholderTextColor="#3e3e3e"
                      ref={vEtco2Ref}
                      keyboardType="decimal-pad" value={vEtco2} onChangeText={v => setAndAdvance(v, setVEtco2, (isGACase || monitoring.some(m => m.includes("Temperature"))) ? vTempRef : undefined, 2)}
                    />
                    <Text style={{ color:"#64748b", fontSize:10, marginTop:6 }}>Currently: {etco2Unit} — change in Settings</Text>
                  </View>
                </View>
              )}

              {(isGACase || monitoring.some(m => m.includes("Temperature"))) && (
                <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
                  <View style={{ flex:1, minWidth:0 }}>
                    <Text style={{ color:"#a78bfa", fontSize:11, fontWeight:"700", marginBottom:6 }}>TEMP</Text>
                    <TextInput
                      style={{ backgroundColor:"#111111", color:"#a78bfa", borderRadius:10,
                        padding: Platform.OS === "web" ? 8 : 10,
                        fontSize: Platform.OS === "web" ? 16 : 20,
                        fontWeight:"600", borderWidth:1, borderColor:"#a78bfa33", textAlign:"center" }}
                      placeholder="—" placeholderTextColor="#3e3e3e"
                      ref={vTempRef}
                      keyboardType="decimal-pad" value={vTemp} onChangeText={v => setAndAdvance(v, setVTemp, monitoring.some(m => m.includes("glucose")) ? vBglRef : undefined, 4)}
                    />
                    <Text style={{ color:"#64748b", fontSize:10, marginTop:6 }}>Currently: °{temperatureUnit} — change in Settings</Text>
                  </View>
                </View>
              )}

              {monitoring.some(m => m.includes("glucose")) && (
                <View style={{ flexDirection:"row", gap:10, marginBottom:20 }}>
                  <View style={{ flex:1, minWidth:0 }}>
                    <Text style={{ color:"#34d399", fontSize:11, fontWeight:"700", marginBottom:6 }}>Serum/peripheral glucose mmol/L</Text>
                    <TextInput
                      style={{ backgroundColor:"#111111", color:"#34d399", borderRadius:10,
                        padding: Platform.OS === "web" ? 8 : 10,
                        fontSize: Platform.OS === "web" ? 16 : 20,
                        fontWeight:"600", borderWidth:1, borderColor:"#34d39933", textAlign:"center" }}
                      placeholder="—" placeholderTextColor="#3e3e3e"
                      ref={vBglRef}
                      keyboardType="decimal-pad" value={vBgl} onChangeText={setVBgl}
                    />
                  </View>
                </View>
              )}
            </>
          )}

          {vitMode === "bp" && (
            <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
              <View style={{ flex:1 }}>
                <Text style={{ color:"#22c55e", fontSize:11, fontWeight:"700", marginBottom:6 }}>HEART RATE</Text>
                <TextInput
                  style={{ backgroundColor:"#111111", color:"#22c55e", borderRadius:10,
                    padding: Platform.OS === "web" ? 9 : 12,
                    fontSize: Platform.OS === "web" ? 18 : 24,
                    fontWeight:"700", borderWidth:1, borderColor:"#22c55e33", textAlign:"center" }}
                  placeholder="—" placeholderTextColor="#3e3e3e"
                  ref={vHRRef}
                  keyboardType="number-pad" value={vHR} onChangeText={setVHR}
                />
              </View>
            </View>
          )}

          <TouchableOpacity onPress={confirmVitals}
            style={{ backgroundColor:"#0f2a1a", borderRadius:14, padding:18, alignItems:"center",
              borderWidth:1, borderColor:"#22c55e" }}>
            <Text style={{ color:"#86efac", fontSize:16, fontWeight:"700" }}>Save vitals</Text>
          </TouchableOpacity>
        </Sheet>

        {/* ── INFUSION SHEET ─────────────────────────────────────────────── */}
        <InfusionSheet
          visible={infOpen}
          onClose={() => { setInfOpen(false); setInfDrug(null); setInfRate(""); setInfRoute(undefined); setInfConcentration(undefined) }}
          infDrugs={INF_DRUGS}
          ratePresets={INFUSION_QUICK_RATES}
          infDrug={infDrug}
          setInfDrug={setInfDrug}
          infRate={infRate}
          setInfRate={setInfRate}
          onConfirm={confirmInfusion}
          routes={INFUSION_ROUTES}
          infRoute={infRoute}
          setInfRoute={setInfRoute}
          laConcentrations={INFUSION_LA_CONCENTRATIONS}
          infConcentration={infConcentration}
          setInfConcentration={setInfConcentration}
          ranges={INFUSION_RANGES}
        />

        {/* ── INFUSION ACTION SHEET ──────────────────────────────────────── */}
        <InfusionActionSheet
          visible={infActOpen}
          onClose={() => { setInfActOpen(false); setInfActTgt(null); setInfActConcentration(undefined) }}
          target={infActTgt}
          ratePresets={INFUSION_QUICK_RATES}
          newRate={infActRate}
          setNewRate={setInfActRate}
          onChangeRate={changeRate}
          onStop={target => { stopInfusion(target); setInfActOpen(false); setInfActTgt(null) }}
          laConcentrations={INFUSION_LA_CONCENTRATIONS}
          newConcentration={infActConcentration}
          setNewConcentration={setInfActConcentration}
          ranges={INFUSION_RANGES}
        />

        {/* ── FLUID SHEET ───────────────────────────────────────────────── */}
        <FluidSheet
          visible={flOpen}
          onClose={() => { setFlOpen(false); setFlFluid(null); setFlVol("500") }}
          fluidList={FLUID_LIST}
          flFluid={flFluid}
          setFlFluid={setFlFluid}
          flVol={flVol}
          setFlVol={setFlVol}
          onConfirm={confirmFluid}
          quickVolumes={FLUID_QUICK_VOLUMES}
        />

        <FluidEndSheet
          visible={flEndOpen}
          onClose={() => setFlEndOpen(false)}
          target={flEndTarget}
          customAmount={flEndCustom}
          setCustomAmount={setFlEndCustom}
          onConfirm={confirmFluidEnd}
        />

        {/* ── AGENT SHEET ───────────────────────────────────────────────── */}
        <AgentSheet
          visible={agOpen}
          onClose={() => { setAgOpen(false); setAgPick(null); setAgPercent(null) }}
          agents={VOLATILE_AGENTS}
          agPick={agPick}
          setAgPick={setAgPick}
          activeAgent={activeAgent}
          onConfirm={confirmAgent}
          quickPercents={AGENT_QUICK_PERCENTS}
          agPercent={agPercent}
          setAgPercent={setAgPercent}
        />

        {/* ── AIRWAY DETAIL SHEET ───────────────────────────────────────── */}
        <Sheet visible={airwayOpen} onClose={() => setAirwayOpen(false)} title={airwayLabel} full>
          {airwayLabel === "Intubated" ? (
            <View style={{ gap:16 }}>
              <View>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:8 }}>Tube size (mm ID)</Text>
                <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                  {["6.0","6.5","7.0","7.5","8.0","8.5"].map(s => (
                    <TouchableOpacity key={s} onPress={() => setAirwayDetail(d => ({ ...d, tubeSize:s }))}
                      style={{ paddingHorizontal:18, paddingVertical:12, borderRadius:10,
                        backgroundColor: airwayDetail.tubeSize===s ? "#6366f1" : "#6366f11a",
                        borderWidth:1, borderColor:"#6366f155" }}>
                      <Text style={{ color: airwayDetail.tubeSize===s ? "#fff" : "#a5b4fc",
                        fontWeight:"700", fontSize:16 }}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:8 }}>Cuff</Text>
                <View style={{ flexDirection:"row", gap:10 }}>
                  {["yes","no"].map(v => (
                    <TouchableOpacity key={v} onPress={() => setAirwayDetail(d => ({ ...d, cuffed: v as "yes"|"no" }))}
                      style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                        backgroundColor: airwayDetail.cuffed===v ? "#6366f1" : "#6366f11a",
                        borderWidth:1, borderColor:"#6366f155" }}>
                      <Text style={{ color: airwayDetail.cuffed===v ? "#fff" : "#a5b4fc", fontWeight:"700" }}>
                        {v === "yes" ? "Cuffed" : "Uncuffed"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:8 }}>Laryngoscope</Text>
                <View style={{ flexDirection:"row", gap:8 }}>
                  {["Direct","Video","FOB"].map(t => (
                    <TouchableOpacity key={t} onPress={() => setAirwayDetail(d => ({ ...d, tool:t }))}
                      style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                        backgroundColor: airwayDetail.tool===t ? "#6366f1" : "#6366f11a",
                        borderWidth:1, borderColor:"#6366f155" }}>
                      <Text style={{ color: airwayDetail.tool===t ? "#fff" : "#a5b4fc",
                        fontWeight:"700", fontSize:13 }}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:8 }}>Cormack-Lehane</Text>
                <View style={{ flexDirection:"row", gap:8 }}>
                  {["I","IIa","IIb","III","IV"].map(g => (
                    <TouchableOpacity key={g} onPress={() => setAirwayDetail(d => ({ ...d, cl:g }))}
                      style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                        backgroundColor: airwayDetail.cl===g ? "#6366f1" : "#6366f11a",
                        borderWidth:1, borderColor:"#6366f155" }}>
                      <Text style={{ color: airwayDetail.cl===g ? "#fff" : "#a5b4fc",
                        fontWeight:"700", fontSize:13 }}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          ) : (
            <View style={{ gap:14 }}>
              <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                letterSpacing:1, marginBottom:4 }}>LMA size</Text>
              <View style={{ flexDirection:"row", gap:8 }}>
                {["1","1.5","2","2.5","3","4","5"].map(s => (
                  <TouchableOpacity key={s} onPress={() => setAirwayDetail(d => ({ ...d, tubeSize:s }))}
                    style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                      backgroundColor: airwayDetail.tubeSize===s ? "#6366f1" : "#6366f11a",
                      borderWidth:1, borderColor:"#6366f155" }}>
                    <Text style={{ color: airwayDetail.tubeSize===s ? "#fff" : "#a5b4fc",
                      fontWeight:"700" }}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <TouchableOpacity onPress={confirmAirway}
            style={{ backgroundColor:"#6366f1", borderRadius:12, padding:16, alignItems:"center", marginTop:20 }}>
            <Text style={{ color:"#fff", fontWeight:"700", fontSize:15 }}>Log {airwayLabel}</Text>
          </TouchableOpacity>
        </Sheet>

        {/* ── EDIT DRUG EVENT MODAL ─────────────────────────────────────── */}
        <Sheet visible={editOpen} onClose={() => setEditOpen(false)}
          title={`Edit ${editEv?.name ?? "event"}`}>
          {editEv && (
            <View style={{ gap:14 }}>
              <View>
                {editEv.type === "drug" && (
                  <>
                    <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", letterSpacing:1,
                      textTransform:"uppercase", marginBottom:8 }}>Dose ({editEv.unit})</Text>
                    <TextInput
                      style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12,
                        fontSize:22, borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
                      keyboardType="decimal-pad" value={editDose} onChangeText={setEditDose}
                    />
                  </>
                )}
              </View>
              <View>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", letterSpacing:1,
                  textTransform:"uppercase", marginBottom:8 }}>Time (HH:MM)</Text>
                <TextInput
                  style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12,
                    fontSize:22, borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
                  placeholder="e.g. 09:15" placeholderTextColor="#475569"
                  value={editTime} onChangeText={setEditTime}
                />
              </View>
              <TouchableOpacity onPress={confirmEdit}
                style={{ backgroundColor:"#2563eb", borderRadius:12, padding:16, alignItems:"center" }}>
                <Text style={{ color:"#fff", fontWeight:"700", fontSize:15 }}>Save changes</Text>
              </TouchableOpacity>
            </View>
          )}
        </Sheet>

        {/* ── COMPLICATIONS PICKER SHEET ───────────────────────────────── */}
        <Sheet visible={compOpen} onClose={() => setCompOpen(false)} title="Complications" full>
          <View style={{ gap:4 }}>
            {COMPLICATION_GROUPS.map(group => {
              const expanded = !!compGroupExpanded[group.id]
              const groupSelected = group.items.filter(i => selectedComplications.includes(i))
              return (
                <View key={group.id} style={{ borderRadius:12, overflow:"hidden",
                  borderWidth:1, borderColor: groupSelected.length > 0 ? "#ef444455" : "#1e2d40",
                  marginBottom:6 }}>
                  <TouchableOpacity
                    onPress={() => setCompGroupExpanded(prev => ({ ...prev, [group.id]: !expanded }))}
                    style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
                      paddingHorizontal:14, paddingVertical:12,
                      backgroundColor: groupSelected.length > 0 ? "#ef444412" : "#111820" }}>
                    <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
                      <Text style={{ color: groupSelected.length > 0 ? "#f87171" : "#cbd5e1",
                        fontSize:13, fontWeight:"700" }}>
                        {COMPLICATION_TC_TITLES[group.id] ? tc(COMPLICATION_TC_TITLES[group.id]) : group.title}
                      </Text>
                      {groupSelected.length > 0 && (
                        <View style={{ paddingHorizontal:6, paddingVertical:2, borderRadius:6,
                          backgroundColor:"#ef444433" }}>
                          <Text style={{ color:"#fca5a5", fontSize:10, fontWeight:"700" }}>
                            {groupSelected.length}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color:"#64748b", fontSize:12 }}>{expanded ? "▲" : "▼"}</Text>
                  </TouchableOpacity>
                  {expanded && (
                    <View style={{ paddingHorizontal:12, paddingBottom:10, paddingTop:4,
                      backgroundColor:"#0d1520", flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                      {group.items.map(item => {
                        const checked = selectedComplications.includes(item)
                        return (
                          <TouchableOpacity key={item}
                            onPress={() => {
                              setSelectedComplications(prev =>
                                checked ? prev.filter(x => x !== item) : [...prev, item]
                              )
                            }}
                            style={{ flexDirection:"row", alignItems:"center", gap:6,
                              paddingHorizontal:10, paddingVertical:8, borderRadius:9,
                              backgroundColor: checked ? "#ef444420" : "#151c28",
                              borderWidth:1, borderColor: checked ? "#ef4444" : "#263246" }}>
                            <View style={{ width:14, height:14, borderRadius:3,
                              backgroundColor: checked ? "#ef4444" : "transparent",
                              borderWidth: checked ? 0 : 1.5, borderColor:"#475569",
                              alignItems:"center", justifyContent:"center" }}>
                              {checked && <Text style={{ color:"#fff", fontSize:9, fontWeight:"900" }}>✓</Text>}
                            </View>
                            <Text style={{ color: checked ? "#fca5a5" : "#94a3b8",
                              fontSize:12, fontWeight: checked ? "700" : "500" }}>{item}</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  )}
                </View>
              )
            })}
          </View>
          <View style={{ marginTop:12, gap:10 }}>
            {selectedComplications.length > 0 && (
              <TouchableOpacity
                onPress={() => setSelectedComplications([])}
                style={{ paddingVertical:10, borderRadius:10, alignItems:"center",
                  backgroundColor:"#1c1414", borderWidth:1, borderColor:"#ef444433" }}>
                <Text style={{ color:"#ef4444", fontSize:12, fontWeight:"700" }}>Clear all</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={saveComplications}
              disabled={compSaving}
              style={{ paddingVertical:16, borderRadius:12, alignItems:"center",
                backgroundColor: compSaving ? "#1a1a1a" : "#7f1d1d",
                borderWidth:1, borderColor: compSaving ? "#3e3e3e" : "#ef4444" }}>
              <Text style={{ color: compSaving ? "#64748b" : "#fca5a5", fontSize:15, fontWeight:"700" }}>
                {compSaving ? "Saving…" : `Save${selectedComplications.length > 0 ? ` (${selectedComplications.length} complication${selectedComplications.length === 1 ? "" : "s"})` : ""}`}
              </Text>
            </TouchableOpacity>
          </View>
        </Sheet>

        {/* ── END CASE CLEANUP SHEET ────────────────────────────────────── */}
        {/* ── START AT SHEET ──────────────────────────────────────────── */}
        <Sheet visible={startAtOpen} onClose={() => setStartAtOpen(false)} title="Start at…">
          <Text style={{ color:colors.textSecondary, fontSize:13, marginBottom:16 }}>
            Enter the time the anaesthesia actually started. The timetable will open from that time and the current time will be highlighted as "now".
          </Text>
          <Text style={{ color:colors.textMuted, fontSize:10, fontWeight:"700", letterSpacing:1.1,
            textTransform:"uppercase", marginBottom:8 }}>Start time (HH:MM)</Text>
          <TextInput
            style={{ backgroundColor:"#111111", color:"#a5b4fc", borderRadius:12, padding:16,
              fontSize:36, fontWeight:"200", borderWidth:1, borderColor:"#6366f166",
              textAlign:"center", fontVariant:["tabular-nums"], marginBottom:16, letterSpacing:4 }}
            value={startAtInput}
            onChangeText={v => {
              // Accept digits only, auto-insert colon
              const digits = v.replace(/\D/g, "").slice(0, 4)
              if (digits.length <= 2) setStartAtInput(digits)
              else setStartAtInput(`${digits.slice(0,2)}:${digits.slice(2)}`)
            }}
            placeholder="HH:MM"
            placeholderTextColor="#334155"
            keyboardType="number-pad"
            maxLength={5}
            autoFocus
          />
          <TouchableOpacity
            onPress={() => startCaseAt(startAtInput)}
            disabled={startAtInput.length < 5}
            style={{ backgroundColor: startAtInput.length >= 5 ? "#1e1a40" : "#111111",
              borderRadius:14, padding:18, alignItems:"center",
              borderWidth:1, borderColor: startAtInput.length >= 5 ? "#6366f1" : "#1e2d40" }}>
            <Text style={{ color: startAtInput.length >= 5 ? "#a5b4fc" : "#334155",
              fontWeight:"900", fontSize:16 }}>
              Start case at {startAtInput || "–"}
            </Text>
          </TouchableOpacity>
        </Sheet>

        <Sheet visible={endCaseOpen} onClose={() => setEndCaseOpen(false)} title="End case" full>
          {(() => {
            const runningItems: { key: string; label: string; sublabel: string; color: string; onStop: () => void | Promise<void> }[] = []
            if (activeAgent) runningItems.push({
              key: `agent-${activeAgent.name}`,
              label: activeAgent.name,
              sublabel: "Volatile · inhalational",
              color: activeAgent.color,
              onStop: stopAgent,
            })
            if (activeGas) runningItems.push({
              key: "gas-settings",
              label: "Gas settings",
              sublabel: `FGF ${activeGas.fgf}L/min · FiO2 ${activeGas.fio2}%`,
              color: "#6366f1",
              onStop: stopGasSettings,
            })
            activeInfusions.forEach(inf => runningItems.push({
              key: `inf-${inf.infId}`,
              label: inf.name,
              sublabel: `${inf.rate} ${inf.unit} infusion`,
              color: inf.color,
              onStop: () => stopInfusion(inf),
            }))
            activeFluids.forEach(fl => runningItems.push({
              key: `fluid-${fl.fluidId}`,
              label: fl.name,
              sublabel: `${fl.volume} mL · fluid`,
              color: fl.color,
              onStop: () => stopFluidDirect(fl),
            }))
            const allDecided = runningItems.length > 0 && runningItems.every(item => !!endCaseDecisions[item.key])
            return (
              <>
                <Text style={{ color:"#94a3b8", fontSize:13, marginBottom:16 }}>
                  Choose what to do with each active item, then finalise.
                </Text>
                {runningItems.map(item => {
                  const dec = endCaseDecisions[item.key]
                  return (
                    <View key={item.key} style={{ marginBottom:10,
                      backgroundColor:item.color+"1a", borderRadius:12, padding:12,
                      borderWidth:1, borderColor:item.color+"44" }}>
                      <View style={{ marginBottom:8 }}>
                        <Text style={{ color:item.color, fontWeight:"700" }}>{item.label}</Text>
                        <Text style={{ color:"#94a3b8", fontSize:11 }}>{item.sublabel}</Text>
                      </View>
                      <View style={{ flexDirection:"row", gap:8 }}>
                        <TouchableOpacity
                          onPress={() => setEndCaseDecisions(prev => ({ ...prev, [item.key]: "stop" }))}
                          style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center",
                            backgroundColor: dec === "stop" ? "#2a0a0a" : "#1c1c1c",
                            borderWidth:1, borderColor: dec === "stop" ? "#ef4444" : "#ef444433" }}>
                          <Text style={{ color: dec === "stop" ? "#ef4444" : "#64748b",
                            fontWeight:"700", fontSize:13 }}>Stop</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setEndCaseDecisions(prev => ({ ...prev, [item.key]: "continue" }))}
                          style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center",
                            backgroundColor: dec === "continue" ? "#0a1f2a" : "#1c1c1c",
                            borderWidth:1, borderColor: dec === "continue" ? "#38bdf8" : "#38bdf833" }}>
                          <Text style={{ color: dec === "continue" ? "#38bdf8" : "#64748b",
                            fontWeight:"700", fontSize:13 }}>Continue postop</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )
                })}
                {allDecided && (
                  <TouchableOpacity
                    onPress={async () => {
                      for (const item of runningItems) {
                        if (endCaseDecisions[item.key] === "stop") await item.onStop()
                      }
                      const continued = runningItems
                        .filter(item => endCaseDecisions[item.key] === "continue")
                        .map(item => `${item.label} (${item.sublabel})`)
                      finaliseCase(continued)
                    }}
                    style={{ marginTop:8, backgroundColor:"#1a2e1a", borderRadius:12,
                      padding:18, alignItems:"center", borderWidth:1, borderColor:"#22c55e" }}>
                    <Text style={{ color:"#86efac", fontWeight:"700", fontSize:16 }}>
                      {tc("continuePostop")}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )
          })()}
        </Sheet>

        {/* ── PREMED LIBRARY SHEET ─────────────────────────────────────── */}
        <Sheet visible={premedPickOpen} onClose={() => { setPremedPickOpen(false); setPremedPickCat(null); setPremedPickDrug(null) }}
          title={`Premedication library — ${premedPickPhase}`} full>
          {!premedPickDrug ? (
            <View>
              {PREMED_LIBRARY.map(cat => {
                const open = premedPickCat === cat.category
                return (
                  <View key={cat.category} style={{ marginBottom:6, borderRadius:10, overflow:"hidden",
                    borderWidth:1, borderColor:"#1e2d40" }}>
                    <TouchableOpacity
                      onPress={() => setPremedPickCat(open ? null : cat.category)}
                      style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center",
                        paddingHorizontal:14, paddingVertical:12, backgroundColor:"#111820" }}>
                      <Text style={{ color:"#cbd5e1", fontSize:13, fontWeight:"700" }}>{cat.category}</Text>
                      <Text style={{ color:"#64748b" }}>{open ? "▲" : "▼"}</Text>
                    </TouchableOpacity>
                    {open && (
                      <View style={{ paddingHorizontal:12, paddingBottom:10, paddingTop:4,
                        backgroundColor:"#0d1520", flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                        {cat.drugs.map(drug => (
                          <TouchableOpacity key={drug.name}
                            onPress={() => { setPremedPickDrug(drug); setPremedPickDose(String(drug.dose)); setPremedPickRoute(drug.defaultRoute) }}
                            style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:9,
                              backgroundColor:"#1e2d40", borderWidth:1, borderColor:"#2a3a50" }}>
                            <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700" }}>{drug.name}</Text>
                            <Text style={{ color:"#64748b", fontSize:10, marginTop:2 }}>{drug.dose} {drug.unit}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          ) : (
            <View style={{ gap:14 }}>
              <TouchableOpacity onPress={() => setPremedPickDrug(null)}>
                <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
              </TouchableOpacity>
              <Text style={{ color:"#f8fafc", fontSize:16, fontWeight:"700" }}>{premedPickDrug.name}</Text>

              <View>
                <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:8 }}>Dose ({premedPickDrug.unit})</Text>
                <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
                  <TouchableOpacity
                    onPress={() => { const v = parseFloat(premedPickDose) || premedPickDrug.dose; setPremedPickDose(String(Math.max(premedPickDrug.min, Math.round((v - premedPickDrug.step) * 1000) / 1000))) }}
                    style={{ width:44, height:44, borderRadius:10, backgroundColor:"#1e2d40", alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:"#2a3a50" }}>
                    <Text style={{ color:"#93c5fd", fontSize: Platform.OS === "web" ? 18 : 22, fontWeight:"700" }}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#fff", borderRadius:10,
                      padding: Platform.OS === "web" ? 9 : 12,
                      fontSize: Platform.OS === "web" ? 18 : 22,
                      borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
                    keyboardType="decimal-pad"
                    value={premedPickDose}
                    onChangeText={setPremedPickDose}
                  />
                  <TouchableOpacity
                    onPress={() => { const v = parseFloat(premedPickDose) || premedPickDrug.dose; setPremedPickDose(String(Math.min(premedPickDrug.max, Math.round((v + premedPickDrug.step) * 1000) / 1000))) }}
                    style={{ width:44, height:44, borderRadius:10, backgroundColor:"#1e2d40", alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:"#2a3a50" }}>
                    <Text style={{ color:"#93c5fd", fontSize: Platform.OS === "web" ? 18 : 22, fontWeight:"700" }}>+</Text>
                  </TouchableOpacity>
                </View>
                {!!premedPickDrug.hint && <Text style={{ color:"#475569", fontSize:11, marginTop:6 }}>{premedPickDrug.hint}</Text>}
              </View>

              <View>
                <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:8 }}>Route</Text>
                <View style={{ flexDirection:"row", gap:8 }}>
                  {premedPickDrug.routes.map(r => (
                    <TouchableOpacity key={r} onPress={() => setPremedPickRoute(r)}
                      style={{ flex:1, paddingVertical:10, borderRadius:8, alignItems:"center",
                        backgroundColor: premedPickRoute === r ? "#1e3a5f" : "#111111",
                        borderWidth:1, borderColor: premedPickRoute === r ? "#3b82f6" : "#2a3a4a" }}>
                      <Text style={{ color: premedPickRoute === r ? "#93c5fd" : "#64748b",
                        fontWeight:"700", fontSize:13 }}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                onPress={() => {
                  const entry = `${premedPickDrug.name} ${premedPickDose} ${premedPickDrug.unit} ${premedPickRoute}`
                  const drugName = premedPickDrug.name
                  const addEntry = (prev: string) => {
                    // Remove existing entry for same drug, then append new one (web behaviour)
                    const items = prev ? prev.split(";").map(s => s.trim()).filter(Boolean) : []
                    const filtered = items.filter(s => !s.startsWith(drugName + " "))
                    return [...filtered, entry].join("; ")
                  }
                  if (premedPickPhase === "evening") {
                    const next = addEntry(premedEveningText)
                    setPremedEveningText(next)
                    setTimeout(() => savePremedication({ evening: next }), 200)
                  } else {
                    const next = addEntry(premedMorningText)
                    setPremedMorningText(next)
                    setTimeout(() => savePremedication({ morning: next }), 200)
                  }
                  setPremedPickOpen(false)
                  setPremedPickDrug(null)
                  setPremedPickCat(null)
                }}
                disabled={!premedPickDose}
                style={{ backgroundColor: premedPickDose ? "#1e3a5f" : "#111111", borderRadius:12,
                  padding:16, alignItems:"center", borderWidth:1, borderColor:"#3b82f6" }}>
                <Text style={{ color:"#93c5fd", fontWeight:"700", fontSize:15 }}>
                  Add to {premedPickPhase}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Sheet>

        {/* ── Continue to Postoperative button (pinned bottom when case ended) ── */}
        {caseEnded && (
          <View style={{ padding:16, backgroundColor:"#0a0f1a", borderTopWidth:1, borderTopColor:"#1e2d40" }}>
            <TouchableOpacity
              onPress={() => {
                const params = continuedPostopItems.length > 0
                  ? `?continuedItems=${encodeURIComponent(continuedPostopItems.join("|"))}`
                  : ""
                router.replace(`/(app)/cases/postop/${id}${params}`)
              }}
              style={{ backgroundColor:"#0f2a1a", borderRadius:14, padding:18, alignItems:"center",
                borderWidth:1, borderColor:"#22c55e" }}>
              <Text style={{ color:"#86efac", fontWeight:"900", fontSize:16 }}>
                {tc("continuePostop")}
              </Text>
              {continuedPostopItems.length > 0 && (
                <Text style={{ color:"#38bdf8", fontSize:11, marginTop:4 }}>
                  {continuedPostopItems.length} item{continuedPostopItems.length > 1 ? "s" : ""} continuing postop
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

      </View>
    </>
  )
}
