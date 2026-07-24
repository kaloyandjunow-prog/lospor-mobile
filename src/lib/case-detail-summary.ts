import { colors } from "@/theme/colors"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { getIcd10BodySystem } from "@lospor/core/preop"
import { deriveCaseStage } from "@lospor/core/case-status"
import { calcIBW as calculateIdealBodyWeight } from "@lospor/core/scores"
import { calculateDrugTotals } from "@lospor/core/intraop-summary"
import {
  calcInfusionTotals as calculateInfusionTotals,
  DEFAULT_INFUSION_WEIGHT_BASIS,
} from "@lospor/core/intraop-totals"

export type LabResult = { test: string; value: string; unit: string }
export type Comorbidity = { label: string; code?: string; sub?: string }
export type TaggedItem = { label: string; code?: string }
export type VascularAccess = {
  siteLabel: string; size: string; sizeUnit: string
  lumens?: string; preexisting?: boolean
}
export type KeyEvent = {
  type: string; name?: string; dose?: number | string; unit?: string
  infId?: string; fluidId?: string; rate?: number | string; col?: number; timestamp?: number | string
}

export type CaseData = {
  id: string
  caseCode?: string
  status: "DRAFT" | "IN_PROGRESS" | "AWAITING_REVIEW" | "COMPLETE"
  finalizedAt?: string
  notes?: string
  user?: { name?: string; institution?: { name?: string; city?: string } }
  preop?: {
    ageYears?: number; sex?: string; heightCm?: number; weightKg?: number; bmi?: number
    bloodType?: string; rhFactor?: string
    diagnosis?: string; diagnosesJson?: TaggedItem[]
    plannedProcedure?: string; proceduresJson?: TaggedItem[]
    teamNotes?: string; emergencySurgery?: boolean; highRiskSurgery?: boolean
    comorbidities?: Comorbidity[]
    allergies?: boolean; allergyDetails?: string; latexAllergy?: boolean
    currentMedications?: string
    familyAnesthesiaProblems?: boolean; familyAnesthesiaDetails?: string
    dentalProsthetics?: boolean; looseTeeth?: boolean; smoking?: boolean; substanceAbuse?: boolean
    bpSystolic?: number; bpDiastolic?: number; heartRate?: number; heartArrhythmia?: boolean
    spO2?: number; temperature?: number; respiratoryRate?: number
    mallampati?: string; mouthOpeningCm?: number; thyromental?: number
    neckMobility?: string; upperLipBiteTest?: string; cormackLehane?: string
    retrognathia?: boolean; prominentIncisors?: boolean; facialHair?: boolean
    difficultAirwayHistory?: boolean; difficultAirwayNotes?: string
    asaScore?: string
    rcriScore?: number; apfelScore?: number; stopBangScore?: number
    labResults?: LabResult[]
    aiOptIn?: boolean
    updatedAt?: string
  }
  intraop?: {
    techniques?: string[]; positions?: string[]; ventilationModes?: string[]
    airwayTools?: string[]; airwayDevices?: string[]
    tubeSize?: number; cuffed?: boolean; dltType?: string; dltSide?: string; dltSize?: number
    volatileAgent?: string
    ecg?: boolean; spO2Monitor?: boolean; nbpMonitor?: boolean; etco2Monitor?: boolean
    tempMonitor?: boolean; invasiveBP?: boolean; cvpMonitor?: boolean; paCatheter?: boolean
    tee?: boolean; bis?: boolean; entropyMonitor?: boolean; nirsMonitor?: boolean
    evokedPotentials?: boolean; tofMonitor?: boolean; bglMonitor?: boolean
    bloodGasMonitor?: boolean; urinaryCatheter?: boolean; stomachTube?: boolean
    vascularAccesses?: VascularAccess[]
    premedicationEvening?: string; premedicationMorning?: string
    startTime?: string; endTime?: string; monthYear?: string; durationMinutes?: number
    crystalloidsMl?: number; colloidsMl?: number; bloodMl?: number; urineMl?: number
    bloodProductsNote?: string
    complications?: string
    keyEvents?: { log?: KeyEvent[] }
    updatedAt?: string
  }
  postop?: {
    aldreteActivity?: number; aldreteRespiration?: number; aldreteCirculation?: number
    aldreteConsciousness?: number; aldreteSpO2?: number; aldreteTotal?: number
    painScoreNRS?: number; temperatureCelsius?: number
    recoveryBpSystolic?: number; recoveryBpDiastolic?: number; recoveryHeartRate?: number; recoverySpO2?: number
    ponv?: boolean; disposition?: "WARD" | "PACU" | "ICU"
    handoverItems?: string[]
    updatedAt?: string
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? "https://app.lospor.org").replace(/\/$/, "")

export const TECHNIQUE_LABELS: Record<string, string> = {
  GENERAL_INHALATION: "Inhalational GA", GENERAL_TIVA: "TIVA", GENERAL_COMBINED: "Balanced GA",
  SPINAL: "Spinal (SAB)", SPINAL_SINGLE: "Spinal — single shot", SPINAL_SINGLE_LUMBAR: "Spinal lumbar",
  SPINAL_SINGLE_LOW_THORACIC: "Spinal low thor.", SPINAL_SINGLE_MID_THORACIC: "Spinal mid thor.",
  SPINAL_SINGLE_HIGH_THORACIC: "Spinal high thor.", SPINAL_CONTINUOUS: "Spinal continuous",
  EPIDURAL: "Epidural", EPIDURAL_CAUDAL: "Epidural caudal", EPIDURAL_LUMBAR: "Epidural lumbar",
  EPIDURAL_LOW_THORACIC: "Epidural low thor.", EPIDURAL_MID_THORACIC: "Epidural mid thor.",
  EPIDURAL_HIGH_THORACIC: "Epidural high thor.", COMBINED_SPINAL_EPIDURAL: "CSE",
  CSE_LUMBAR: "CSE lumbar", CSE_LOW_THORACIC: "CSE low thor.", CSE_MID_THORACIC: "CSE mid thor.",
  CSE_HIGH_THORACIC: "CSE high thor.", DPE: "DPE",
  BLOCK_INTERSCALENE: "Interscalene", BLOCK_SUPRACLAVICULAR: "Supraclavicular",
  BLOCK_INFRACLAVICULAR: "Infraclavicular", BLOCK_AXILLARY: "Axillary",
  BLOCK_FEMORAL: "Femoral", BLOCK_ADDUCTOR: "Adductor canal", BLOCK_SCIATIC: "Sciatic",
  BLOCK_POPLITEAL: "Popliteal", BLOCK_TAP: "TAP", BLOCK_ESP: "Erector spinae",
  BLOCK_PARAVERTEBRAL: "Paravertebral", BLOCK_QL: "QL block", BLOCK_PECS1: "PECS I",
  BLOCK_PECS2: "PECS II", BLOCK_ILIOINGUINAL: "Ilioinguinal", BLOCK_INTERCOSTAL: "Intercostal",
  LOCAL: "Local infiltration", SEDATION: "Sedation", SEDATION_CONSCIOUS: "Conscious sedation",
  SEDATION_DEEP: "Deep sedation", SEDATION_MAC: "MAC",
}

export const POSITION_LABELS: Record<string, string> = {
  SUPINE: "Supine", PRONE: "Prone", LEFT_LATERAL: "Left lateral", RIGHT_LATERAL: "Right lateral",
  GYNECOLOGICAL: "Lithotomy", TRENDELENBURG: "Trendelenburg", REVERSE_TRENDELENBURG: "Rev. Trendelenburg",
  FOWLER: "Fowler's", BEACH_CHAIR: "Beach chair", LLOYD_DAVIES: "Lloyd-Davies",
  LATERAL_DECUBITUS_LEFT: "Lat. decubitus L", LATERAL_DECUBITUS_RIGHT: "Lat. decubitus R",
  SITTING: "Sitting", JACKKNIFE: "Jackknife", KNEE_CHEST: "Knee-chest",
}

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
  "Other": "#94a3b8",
}

export const SYSTEM_ORDER = [
  "Cardiovascular", "Respiratory", "Neurological / Psychiatric", "Endocrine / Metabolic",
  "Gastrointestinal / Hepatic", "Renal / Urological", "Haematological", "Musculoskeletal",
  "Neoplasms", "Infectious diseases", "Ophthalmological / ENT", "Other",
]

export const AIRWAY_TOOL_LABELS: Record<string, string> = {
  VIDEO_LARY: "Video lary", DIRECT_LARY: "Direct lary", FOB: "FOB",
  BOUGIE: "Bougie", STYLET: "Stylet", AWAKE: "Awake", RETROGRADE: "Retrograde",
}

export type MonitorKey = keyof NonNullable<CaseData["intraop"]>
export const MONITOR_MAP: { key: MonitorKey; label: string }[] = [
  { key: "ecg", label: "ECG" }, { key: "spO2Monitor", label: "SpO₂" },
  { key: "nbpMonitor", label: "NIBP" }, { key: "etco2Monitor", label: "EtCO₂" },
  { key: "tempMonitor", label: "Temp" }, { key: "invasiveBP", label: "IBP" },
  { key: "cvpMonitor", label: "CVP" }, { key: "paCatheter", label: "PA cath" },
  { key: "tee", label: "TEE" }, { key: "bis", label: "BIS" },
  { key: "entropyMonitor", label: "Entropy" }, { key: "nirsMonitor", label: "NIRS" },
  { key: "evokedPotentials", label: "SSEP/MEP" }, { key: "tofMonitor", label: "TOF/NMT" },
  { key: "bglMonitor", label: "Serum/peripheral glucose" }, { key: "bloodGasMonitor", label: "ABG" },
  { key: "urinaryCatheter", label: "Urine" }, { key: "stomachTube", label: "NGT" },
]

export const HANDOVER_LABELS: Record<string, string> = {
  analgesia: "Analgesia", nausea: "Nausea / PONV", fluids: "IV fluids",
  obs_freq: "Obs frequency", drain: "Drain", catheter: "Catheter",
  antibiotics: "Antibiotics", glucose: "Serum/peripheral glucose monitoring", o2: "Oxygen therapy",
  positioning: "Positioning", diet: "Diet restrictions", follow_up: "Follow-up",
  other: "Other",
}

// ─── Utility functions ────────────────────────────────────────────────────────

export function techniqueLabel(code: string): string {
  if (TECHNIQUE_LABELS[code]) return TECHNIQUE_LABELS[code]
  if (code.startsWith("OTHER:")) return code.slice(6)
  return code
}

export const getBodySystem = getIcd10BodySystem

export type RiskLevel = "low" | "mid" | "high"

export function rcriRiskLabel(score: number, tc: (k: ClinicalStringKey) => string): { label: string; level: RiskLevel } {
  if (score === 0) return { label: tc("rcriVeryLow"), level: "low" }
  if (score === 1) return { label: tc("rcriLow"), level: "low" }
  if (score === 2) return { label: tc("rcriModerate"), level: "mid" }
  return { label: tc("rcriHigh"), level: "high" }
}

export function apfelRiskLabel(score: number, tc: (k: ClinicalStringKey) => string): { label: string; level: RiskLevel } {
  if (score <= 1) return { label: tc("apfelLow"), level: "low" }
  if (score === 2) return { label: tc("apfelModerate"), level: "mid" }
  return { label: tc("apfelHigh"), level: "high" }
}

export function stopBangRiskLabel(score: number, tc: (k: ClinicalStringKey) => string): { label: string; level: RiskLevel } {
  if (score <= 2) return { label: tc("osaLow"), level: "low" }
  if (score <= 4) return { label: tc("osaIntermediate"), level: "mid" }
  return { label: tc("osaHigh"), level: "high" }
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
  if (HANDOVER_LABELS[code]) return HANDOVER_LABELS[code]
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

