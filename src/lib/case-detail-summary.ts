import { colors } from "@/theme/colors"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { getIcd10BodySystem, ICD10_BODY_SYSTEM_ORDER } from "@lospor/core/preop"
import { normalizeOptionCode } from "@lospor/core/option-aliases"
import { deriveCaseStage } from "@lospor/core/case-status"
import { calcIBW as calculateIdealBodyWeight } from "@lospor/core/scores"
import { calculateDrugTotals } from "@lospor/core/intraop-summary"
import { handoverLabel } from "@lospor/core/postop"
import type {
  CaseDetailDto,
  ClinicalTagDto,
  IntraopKeyEventDto,
  LabResultDto,
  VascularAccessDto,
} from "@lospor/core/case-detail"
import {
  apfelRiskBand,
  rcriRiskBand,
  stopBangRiskBand,
  type RiskSeverity,
} from "@lospor/core/risk"
import {
  calcInfusionTotals as calculateInfusionTotals,
  DEFAULT_INFUSION_WEIGHT_BASIS,
} from "@lospor/core/intraop-totals"
import {
  AIRWAY_TOOLS,
  MONITORING,
  POSITIONS,
  TECHNIQUE_TREE,
  findLabeledValuePath,
  formatTechniquePath,
} from "@lospor/core/catalog"

export type LabResult = LabResultDto
export type Comorbidity = ClinicalTagDto
export type TaggedItem = ClinicalTagDto
export type VascularAccess = VascularAccessDto
export type KeyEvent = IntraopKeyEventDto

export type CaseData = CaseDetailDto
// ─── Constants ────────────────────────────────────────────────────────────────

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? "https://app.lospor.org").replace(/\/$/, "")

export const BODY_SYSTEM_COLORS: Record<string, string> = {
  "Cardiovascular": "#ef4444",
  "Respiratory": "#38bdf8",
  "Neurological / Psychiatric": "#a78bfa",
  "Endocrine / Metabolic": "#fbbf24",
  "Gastrointestinal / Hepatic": "#f97316",
  "Renal / Urological": "#2dd4bf",
  "Haematological": "#fb7185",
  "Musculoskeletal": "#84cc16",
  "Neoplasms": "#f472b6",
  "Infectious diseases": "#d97706",
  "Ophthalmological / ENT": "#22d3ee",
  "Obstetric": "#e879f9",
  "Congenital": "#818cf8",
  "Other": "#94a3b8",
}

export const SYSTEM_ORDER = ICD10_BODY_SYSTEM_ORDER

export type MonitorKey = keyof NonNullable<CaseData["intraop"]>
export const MONITOR_MAP: { key: MonitorKey; label: string }[] = MONITORING.map(option => ({
  key: option.field as MonitorKey,
  label: option.label,
}))

// ─── Utility functions ────────────────────────────────────────────────────────

export function techniqueLabel(code: string): string {
  const normalized = normalizeOptionCode("TECHNIQUE", code)
  return formatTechniquePath(
    normalized,
    findLabeledValuePath(normalized, TECHNIQUE_TREE),
  )
}

const POSITION_LABEL_BY_CODE = Object.fromEntries(
  POSITIONS.map(option => [option.v, option.label]),
)
const AIRWAY_TOOL_LABEL_BY_CODE = Object.fromEntries(AIRWAY_TOOLS)

export function positionLabel(code: string): string {
  return POSITION_LABEL_BY_CODE[code] ?? code
}

export function airwayToolLabel(code: string): string {
  return AIRWAY_TOOL_LABEL_BY_CODE[code] ?? code
}

export const getBodySystem = getIcd10BodySystem

export type RiskLevel = RiskSeverity

export function rcriRiskLabel(score: number, tc: (k: ClinicalStringKey) => string): { label: string; level: RiskLevel } {
  const band = rcriRiskBand(score)
  const label = band.key === "very_low" ? tc("rcriVeryLow")
    : band.key === "low" ? tc("rcriLow")
    : band.key === "moderate" ? tc("rcriModerate") : tc("rcriHigh")
  return { label, level: band.severity }
}

export function apfelRiskLabel(score: number, tc: (k: ClinicalStringKey) => string): { label: string; level: RiskLevel } {
  const band = apfelRiskBand(score)
  const label = band.key === "low" ? tc("apfelLow")
    : band.key === "moderate" ? tc("apfelModerate") : tc("apfelHigh")
  return { label, level: band.severity }
}

export function stopBangRiskLabel(score: number, tc: (k: ClinicalStringKey) => string): { label: string; level: RiskLevel } {
  const band = stopBangRiskBand(score)
  const label = band.key === "low" ? tc("osaLow")
    : band.key === "intermediate" ? tc("osaIntermediate") : tc("osaHigh")
  return { label, level: band.severity }
}

export function riskColor(level: RiskLevel): string {
  if (level === "low") return colors.success
  if (level === "mid") return colors.warning
  return colors.danger
}

export const BODY_SYSTEM_TC: Record<string, ClinicalStringKey> = {
  "Cardiovascular":             "sysCardiovascular",
  "Respiratory":                "sysRespiratory",
  "Neurological / Psychiatric": "sysNeuroPsychiatric",
  "Endocrine / Metabolic":      "sysEndocrineMetabolic",
  "Gastrointestinal / Hepatic": "sysGastroHepatic",
  "Renal / Urological":         "sysRenalUrological",
  "Haematological":             "sysHaematological",
  "Musculoskeletal":            "sysMusculoskeletal",
  "Neoplasms":                  "sysNeoplasms",
  "Infectious diseases":        "sysInfectious",
  "Ophthalmological / ENT":     "sysOphthalmENT",
  "Other":                      "sysOther",
}

export function calcDrugTotals(log: KeyEvent[]): { name: string; unit: string; total: number }[] {
  return calculateDrugTotals({
    drugs: log
      .filter(event =>
        event.type === "drug"
        && event.name != null
        && event.dose != null,
      )
      .map((event, index) => ({
        colIdx: event.col ?? index,
        name: event.name!,
        dose: String(event.dose),
        unit: event.unit ?? "mg",
      })),
  })
}

export function getActiveInfusions(log: KeyEvent[]): { name: string; rate: number | string; unit: string }[] {
  const infMap: Record<string, { name: string; rate: number | string; unit: string; stopped: boolean }> = {}
  const sorted = [...log].sort((a, b) => {
    const ta = typeof a.timestamp === "number" ? a.timestamp : parseInt(String(a.timestamp ?? "0"), 10)
    const tb = typeof b.timestamp === "number" ? b.timestamp : parseInt(String(b.timestamp ?? "0"), 10)
    return ta - tb
  })
  for (const ev of sorted) {
    if (!ev.infId) continue
    if (ev.type === "infusion_start") {
      infMap[ev.infId] = { name: ev.name ?? "Infusion", rate: ev.rate ?? 0, unit: ev.unit ?? "ml/h", stopped: false }
    } else if (ev.type === "infusion_rate" && infMap[ev.infId]) {
      infMap[ev.infId].rate = ev.rate ?? infMap[ev.infId].rate
    } else if (ev.type === "infusion_stop" && infMap[ev.infId]) {
      infMap[ev.infId].stopped = true
    }
  }
  return Object.values(infMap).filter(i => !i.stopped)
}

export function formatTimeHHMM(isoString: string): string {
  try {
    const d = new Date(isoString)
    const h = d.getUTCHours().toString().padStart(2, "0")
    const m = d.getUTCMinutes().toString().padStart(2, "0")
    return `${h}:${m}`
  } catch {
    return isoString
  }
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export function calcIBW(sex: string | undefined, heightCm: number): number {
  const canonicalSex = sex === "FEMALE" || sex === "F"
    ? "FEMALE"
    : sex === "OTHER"
      ? "OTHER"
      : "MALE"
  return calculateIdealBodyWeight(heightCm, canonicalSex)
}

// Weight basis for per-kg infusion units — mirrors web INFUSION_WEIGHT_BASIS
export const INFUSION_WEIGHT_BASIS = DEFAULT_INFUSION_WEIGHT_BASIS

export function calcInfusionTotals(
  infusions: { id?: string; name: string; rate: string; unit: string; startCol: number; endCol: number; rateChanges?: { col: number; rate: string; unit: string }[] }[],
  ibw: number | null,
  tbw: number | null,
): { name: string; total: number; unit: string; weightUsed: number | null; weightBasis: "IBW" | "TBW" | null }[] {
  return calculateInfusionTotals(
    infusions,
    ibw,
    tbw,
    { ...DEFAULT_INFUSION_WEIGHT_BASIS },
  ).map(result => ({
    name: result.name,
    total: result.total,
    unit: result.unit,
    weightUsed: result.weightUsed,
    weightBasis: result.weightBasis === "none"
      ? null
      : result.weightBasis,
  }))
}

export function formatAirway(intraop: CaseData["intraop"]): string {
  if (!intraop) return ""
  const devices = intraop.airwayDevices ?? []
  if (devices.includes("ORAL_ETT")) {
    return `Oral ETT ${intraop.tubeSize ?? "?"}mm${intraop.cuffed ? " cuffed" : ""}`
  }
  if (devices.includes("NASAL_ETT")) {
    return `Nasal ETT ${intraop.tubeSize ?? "?"}mm${intraop.cuffed ? " cuffed" : ""}`
  }
  if (devices.includes("LMA")) return `LMA ${intraop.tubeSize ?? ""}`.trim()
  if (devices.includes("DOUBLE_LUMEN_TUBE")) {
    return `DLT ${intraop.dltSide ?? ""} ${intraop.dltType ?? ""} ${intraop.dltSize ?? ""}Fr`.replace(/\s+/g, " ").trim()
  }
  if (devices.includes("FACE_MASK")) return "Face mask"
  return devices[0] ?? ""
}

export function formatHandoverItem(code: string): string {
  const canonical = handoverLabel(code)
  if (canonical) return canonical
  return code.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())
}

export function computedDisplayStatus(data: CaseData): string {
  return deriveCaseStage(data)
  // Postop submitted → awaiting review / closure
  // Case ended but no postop yet → awaiting postop documentation
  // Preop complete (diagnosis + procedure + ASA) → awaiting allocation
  // Preop started but not complete
}

export function asaColor(score: string | undefined): string {
  if (!score) return colors.textMuted
  const s = score.toUpperCase()
  if (/^VI/.test(s)) return colors.textMuted
  if (/^V[^I]/.test(s) || s === "V") return colors.danger
  if (/^IV/.test(s)) return "#f97316"
  if (/^III/.test(s)) return colors.warning
  if (/^II[^I]/.test(s) || s.startsWith("II")) return "#84cc16"
  if (/^I[^VE]/.test(s) || s === "I" || s === "IE") return colors.success
  return colors.textMuted
}

// ─── Helper Components ────────────────────────────────────────────────────────

