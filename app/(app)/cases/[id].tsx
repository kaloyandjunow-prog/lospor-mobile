import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  View, Text, ScrollView, TouchableOpacity, Pressable,
  Alert, Linking, ActivityIndicator,
} from "react-native"
import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import { apiFetch, apiJson } from "@/lib/api"
import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { STATUS_META } from "@/components/ui"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences, type ClinicalStringKey, type TranslationKey } from "@/lib/preferences-context"

// ─── Types ────────────────────────────────────────────────────────────────────

type LabResult = { test: string; value: string; unit: string }
type Comorbidity = { label: string; code?: string; sub?: string }
type TaggedItem = { label: string; code?: string }
type VascularAccess = {
  siteLabel: string; size: string; sizeUnit: string
  lumens?: string; preexisting?: boolean
}
type KeyEvent = {
  type: string; name?: string; dose?: number | string; unit?: string
  infId?: string; fluidId?: string; rate?: number | string; col?: number; timestamp?: number | string
}

type CaseData = {
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

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? "https://app.lospor.org").replace(/\/$/, "")

const TECHNIQUE_LABELS: Record<string, string> = {
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

const POSITION_LABELS: Record<string, string> = {
  SUPINE: "Supine", PRONE: "Prone", LEFT_LATERAL: "Left lateral", RIGHT_LATERAL: "Right lateral",
  GYNECOLOGICAL: "Lithotomy", TRENDELENBURG: "Trendelenburg", REVERSE_TRENDELENBURG: "Rev. Trendelenburg",
  FOWLER: "Fowler's", BEACH_CHAIR: "Beach chair", LLOYD_DAVIES: "Lloyd-Davies",
  LATERAL_DECUBITUS_LEFT: "Lat. decubitus L", LATERAL_DECUBITUS_RIGHT: "Lat. decubitus R",
  SITTING: "Sitting", JACKKNIFE: "Jackknife", KNEE_CHEST: "Knee-chest",
}

const BODY_SYSTEM_COLORS: Record<string, string> = {
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

const SYSTEM_ORDER = [
  "Cardiovascular", "Respiratory", "Neurological / Psychiatric", "Endocrine / Metabolic",
  "Gastrointestinal / Hepatic", "Renal / Urological", "Haematological", "Musculoskeletal",
  "Neoplasms", "Infectious diseases", "Ophthalmological / ENT", "Other",
]

const AIRWAY_TOOL_LABELS: Record<string, string> = {
  VIDEO_LARY: "Video lary", DIRECT_LARY: "Direct lary", FOB: "FOB",
  BOUGIE: "Bougie", STYLET: "Stylet", AWAKE: "Awake", RETROGRADE: "Retrograde",
}

type MonitorKey = keyof NonNullable<CaseData["intraop"]>
const MONITOR_MAP: { key: MonitorKey; label: string }[] = [
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

const HANDOVER_LABELS: Record<string, string> = {
  analgesia: "Analgesia", nausea: "Nausea / PONV", fluids: "IV fluids",
  obs_freq: "Obs frequency", drain: "Drain", catheter: "Catheter",
  antibiotics: "Antibiotics", glucose: "Serum/peripheral glucose monitoring", o2: "Oxygen therapy",
  positioning: "Positioning", diet: "Diet restrictions", follow_up: "Follow-up",
  other: "Other",
}

// ─── Utility functions ────────────────────────────────────────────────────────

function techniqueLabel(code: string): string {
  if (TECHNIQUE_LABELS[code]) return TECHNIQUE_LABELS[code]
  if (code.startsWith("OTHER:")) return code.slice(6)
  return code
}

function getBodySystem(code: string): string {
  if (!code) return "Other"
  // ICD-10 single-letter chapter prefixes (the app moved off ICD-11; codes
  // are always ICD-10-shaped now).
  const p1 = code.charAt(0).toUpperCase(), n = parseInt(code.substring(1, 3), 10) || 0
  if (p1 === "I") return "Cardiovascular"
  if (p1 === "J") return "Respiratory"
  if (p1 === "G" || p1 === "F") return "Neurological / Psychiatric"
  if (p1 === "E") return "Endocrine / Metabolic"
  if (p1 === "K") return "Gastrointestinal / Hepatic"
  if (p1 === "N") return "Renal / Urological"
  if (p1 === "D") return (n >= 50 && n <= 89) ? "Haematological" : "Neoplasms"
  if (p1 === "C") return "Neoplasms"
  if (p1 === "M") return "Musculoskeletal"
  if (p1 === "A" || p1 === "B") return "Infectious diseases"
  if (p1 === "H") return "Ophthalmological / ENT"
  if (p1 === "O") return "Obstetric"
  if (p1 === "Q") return "Congenital"
  return "Other"
}

type RiskLevel = "low" | "mid" | "high"

function rcriRiskLabel(score: number, tc: (k: ClinicalStringKey) => string): { label: string; level: RiskLevel } {
  if (score === 0) return { label: tc("rcriVeryLow"), level: "low" }
  if (score === 1) return { label: tc("rcriLow"), level: "low" }
  if (score === 2) return { label: tc("rcriModerate"), level: "mid" }
  return { label: tc("rcriHigh"), level: "high" }
}

function apfelRiskLabel(score: number, tc: (k: ClinicalStringKey) => string): { label: string; level: RiskLevel } {
  if (score <= 1) return { label: tc("apfelLow"), level: "low" }
  if (score === 2) return { label: tc("apfelModerate"), level: "mid" }
  return { label: tc("apfelHigh"), level: "high" }
}

function stopBangRiskLabel(score: number, tc: (k: ClinicalStringKey) => string): { label: string; level: RiskLevel } {
  if (score <= 2) return { label: tc("osaLow"), level: "low" }
  if (score <= 4) return { label: tc("osaIntermediate"), level: "mid" }
  return { label: tc("osaHigh"), level: "high" }
}

function riskColor(level: RiskLevel): string {
  if (level === "low") return colors.success
  if (level === "mid") return colors.warning
  return colors.danger
}

const BODY_SYSTEM_TC: Record<string, ClinicalStringKey> = {
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

function calcDrugTotals(log: KeyEvent[]): { name: string; unit: string; total: number }[] {
  const map: Record<string, { unit: string; total: number }> = {}
  for (const ev of log) {
    if (ev.type !== "drug" || !ev.name || ev.dose == null) continue
    const key = `${ev.name}__${ev.unit ?? "mg"}`
    const prev = map[key] ?? { unit: ev.unit ?? "mg", total: 0 }
    map[key] = { ...prev, total: prev.total + (parseFloat(String(ev.dose)) || 0) }
  }
  return Object.entries(map).map(([k, v]) => ({
    name: k.split("__")[0],
    unit: v.unit,
    total: Math.round(v.total * 100) / 100,
  }))
}

function getActiveInfusions(log: KeyEvent[]): { name: string; rate: number | string; unit: string }[] {
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

function formatTimeHHMM(isoString: string): string {
  try {
    const d = new Date(isoString)
    const h = d.getUTCHours().toString().padStart(2, "0")
    const m = d.getUTCMinutes().toString().padStart(2, "0")
    return `${h}:${m}`
  } catch {
    return isoString
  }
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

function calcIBW(sex: string | undefined, heightCm: number): number {
  const heightInches = heightCm / 2.54
  const base = (sex === "FEMALE" || sex === "F") ? 45.5 : 50
  return Math.round((base + 2.3 * (heightInches - 60)) * 10) / 10
}

// Weight basis for per-kg infusion units — mirrors web INFUSION_WEIGHT_BASIS
const INFUSION_WEIGHT_BASIS: Record<string, "IBW" | "TBW"> = {
  "Propofol":"IBW","Remifentanil":"IBW","Ketamine":"IBW","Midazolam":"IBW",
  "Dexmedetomidine":"TBW","Fentanyl":"IBW","Sufentanil":"IBW","Morphine":"IBW","Alfentanil":"IBW",
  "Norepinephrine":"IBW","Epinephrine":"IBW","Phenylephrine":"TBW",
  "Dopamine":"TBW","Dobutamine":"TBW","Rocuronium":"IBW","Cisatracurium":"IBW","Nitroglycerin":"TBW",
}

function calcInfusionTotals(
  infusions: { id?: string; name: string; rate: string; unit: string; startCol: number; endCol: number; rateChanges?: { col: number; rate: string; unit: string }[] }[],
  ibw: number | null,
  tbw: number | null,
): { name: string; total: number; unit: string; weightUsed: number | null; weightBasis: "IBW" | "TBW" | null }[] {
  return infusions.map(inf => {
    const basis  = INFUSION_WEIGHT_BASIS[inf.name] ?? "IBW"
    const bodyWt = basis === "TBW" ? (tbw ?? ibw) : (ibw ?? tbw)
    const sorted = (inf.rateChanges ?? []).slice().sort((a, b) => a.col - b.col)

    function seg(rate: number, unit: string, cols: number): number {
      const isPerKg = unit.includes("/kg/")
      const wt = isPerKg && bodyWt ? bodyWt : isPerKg ? 1 : 1
      const mins = unit.includes("/min") ? cols * 5 : cols * 5 / 60
      return rate * wt * mins
    }

    let total = 0; let prevCol = inf.startCol
    let prevRate = parseFloat(inf.rate) || 0; let prevUnit = inf.unit
    for (const rc of sorted) {
      total += seg(prevRate, prevUnit, rc.col - prevCol)
      prevCol = rc.col; prevRate = parseFloat(rc.rate) || 0; prevUnit = rc.unit
    }
    total += seg(prevRate, prevUnit, inf.endCol - prevCol + 1)

    const baseUnit = prevUnit.replace(/\/kg\/min$/, "").replace(/\/kg\/hr$/, "").replace(/\/min$/, "").replace(/\/hr$/, "").trim()
    const anyPerKg = inf.unit.includes("/kg/") || (inf.rateChanges ?? []).some(rc => rc.unit.includes("/kg/"))
    const weightUsed = anyPerKg && bodyWt ? Math.round(bodyWt * 10) / 10 : null

    return {
      name: inf.name,
      total: Math.round(total * 100) / 100,
      unit: baseUnit,
      weightUsed,
      weightBasis: anyPerKg ? basis : null,
    }
  })
}

function formatAirway(intraop: CaseData["intraop"]): string {
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

function formatHandoverItem(code: string): string {
  if (HANDOVER_LABELS[code]) return HANDOVER_LABELS[code]
  return code.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())
}

// Compute the visual display status from the full case record, matching web app logic.
function computedDisplayStatus(data: CaseData): string {
  if (data.status === "COMPLETE") return "COMPLETE"
  // Postop submitted → awaiting review / closure
  if (data.status === "AWAITING_REVIEW") return "AWAITING_REVIEW"
  // Case ended but no postop yet → awaiting postop documentation
  if (data.intraop?.endTime != null) return "AWAITING_POSTOP"
  if (data.status === "IN_PROGRESS") return "IN_PROGRESS"
  // Preop complete (diagnosis + procedure + ASA) → awaiting allocation
  const preopComplete = !!(data.preop?.diagnosis && data.preop?.plannedProcedure && data.preop?.asaScore)
  if (preopComplete) return "AWAITING_ALLOCATION"
  // Preop started but not complete
  if (data.preop?.diagnosis) return "IN_CONSULTATION"
  return "DRAFT"
}

function asaColor(score: string | undefined): string {
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

function SummaryCard({
  title, children, defaultOpen = true, badge,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: string | number
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <View style={{
      backgroundColor: colors.surfaceRaised, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden",
    }}>
      <Pressable
        onPress={() => setOpen(v => !v)}
        style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 16, paddingVertical: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{
            color: colors.textPrimary, fontSize: 13, fontWeight: "900",
            textTransform: "uppercase", letterSpacing: 0.8,
          }}>
            {title}
          </Text>
          {badge != null && (
            <View style={{
              backgroundColor: withAlpha(colors.primary, "22"),
              borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2,
            }}>
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{open ? "▼" : "▶"}</Text>
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>{children}</View>
      )}
    </View>
  )
}

function InfoRow({
  label, value, valueColor,
}: { label: string; value?: string | null; valueColor?: string }) {
  if (!value) return null
  return (
    <View style={{
      flexDirection: "row", justifyContent: "space-between",
      alignItems: "flex-start", marginBottom: 8,
    }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{label}</Text>
      <Text style={{
        color: valueColor ?? colors.textPrimary, fontSize: 12,
        fontWeight: "600", flex: 2, textAlign: "right",
      }}>
        {value}
      </Text>
    </View>
  )
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={{
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
      backgroundColor: color + "22", borderWidth: 1, borderColor: color + "55",
      marginRight: 6, marginBottom: 6,
    }}>
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  )
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
      {children}
    </View>
  )
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
}

function ActionButton({
  label, onPress, disabled, color = colors.primary,
}: { label: string; onPress: () => void; disabled?: boolean; color?: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        opacity: disabled ? 0.4 : 1,
        paddingHorizontal: 16, paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: withAlpha(color, "22"),
        borderWidth: 1, borderColor: withAlpha(color, "66"),
        marginRight: 8,
      }}
    >
      <Text style={{ color, fontSize: 12, fontWeight: "800" }}>{label}</Text>
    </TouchableOpacity>
  )
}

function AldreteRow({
  label, value, descriptions,
}: { label: string; value?: number; descriptions: [string, string, string] }) {
  const score = value ?? 0
  const desc = descriptions[score] ?? ""
  const scoreColor = score === 2 ? colors.success : score === 1 ? colors.warning : colors.danger
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>{desc}</Text>
      </View>
      <View style={{
        width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center",
        backgroundColor: withAlpha(scoreColor, "22"), borderWidth: 1, borderColor: withAlpha(scoreColor, "66"),
      }}>
        <Text style={{ color: scoreColor, fontSize: 14, fontWeight: "800" }}>{score}</Text>
      </View>
    </View>
  )
}

// ─── Card 1: Preoperative ─────────────────────────────────────────────────────

function PreopCard({ preop, tc, t }: { preop: CaseData["preop"]; tc: (key: ClinicalStringKey) => string; t: (key: TranslationKey) => string }) {
  if (!preop) {
    return (
      <SummaryCard title={tc("cardPreop")}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("noPreopData")}</Text>
      </SummaryCard>
    )
  }

  const bmi = preop.bmi ?? (
    preop.weightKg != null && preop.heightCm != null
      ? Math.round(preop.weightKg / Math.pow(preop.heightCm / 100, 2) * 10) / 10
      : undefined
  )
  const showIBW = bmi != null && bmi >= 30 && preop.heightCm != null
  const ibw = showIBW ? calcIBW(preop.sex, preop.heightCm!) : undefined

  const diagLabel = preop.diagnosesJson?.[0]?.label ?? preop.diagnosis
  const procLabel = preop.proceduresJson?.[0]?.label ?? preop.plannedProcedure

  const bloodType = preop.bloodType && preop.rhFactor
    ? `${preop.bloodType}${preop.rhFactor === "POSITIVE" ? "+" : preop.rhFactor === "NEGATIVE" ? "−" : preop.rhFactor}`
    : undefined

  const sexLabel = preop.sex === "MALE" ? tc("sexMale") : preop.sex === "FEMALE" ? tc("sexFemale") : preop.sex

  const rcriResult = preop.rcriScore != null ? rcriRiskLabel(preop.rcriScore, tc) : null
  const apfelResult = preop.apfelScore != null ? apfelRiskLabel(preop.apfelScore, tc) : null
  const stopBangResult = preop.stopBangScore != null ? stopBangRiskLabel(preop.stopBangScore, tc) : null

  const vitals: string[] = []
  if (preop.bpSystolic != null && preop.bpDiastolic != null) vitals.push(`BP ${preop.bpSystolic}/${preop.bpDiastolic}`)
  else if (preop.bpSystolic != null) vitals.push(`SBP ${preop.bpSystolic}`)
  if (preop.heartRate != null) vitals.push(`HR ${preop.heartRate}`)
  if (preop.spO2 != null) vitals.push(`SpO₂ ${preop.spO2}%`)
  if (preop.temperature != null) vitals.push(`Temp ${preop.temperature}°C`)
  if (preop.respiratoryRate != null) vitals.push(`RR ${preop.respiratoryRate}/min`)

  type RiskItem = { label: string; score: number; max: string; risk: string; level: RiskLevel }
  const riskItems: RiskItem[] = [
    rcriResult ? { label: "RCRI", score: preop.rcriScore!, max: "6", risk: rcriResult.label, level: rcriResult.level } : null,
    apfelResult ? { label: "Apfel", score: preop.apfelScore!, max: "4", risk: apfelResult.label, level: apfelResult.level } : null,
    stopBangResult ? { label: "STOP-BANG", score: preop.stopBangScore!, max: "8", risk: stopBangResult.label, level: stopBangResult.level } : null,
  ].filter((x): x is RiskItem => x !== null)

  return (
    <SummaryCard title={tc("cardPreop")}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {/* Left: demographics */}
        <View style={{ flex: 1 }}>
          <InfoRow label={tc("summaryAge")} value={preop.ageYears != null ? `${preop.ageYears} yr` : null} />
          <InfoRow label={tc("summarySex")} value={sexLabel ?? null} />
          <InfoRow label={tc("summaryHeight")} value={preop.heightCm != null ? `${preop.heightCm} cm` : null} />
          <InfoRow label={tc("summaryWeight")} value={preop.weightKg != null ? `${preop.weightKg} kg` : null} />
          <InfoRow label={tc("summaryBMI")} value={bmi != null ? `${bmi} kg/m²` : null} />
          {showIBW && ibw != null && (
            <InfoRow label={tc("summaryIBW")} value={`${ibw} kg`} valueColor={colors.warning} />
          )}
          <InfoRow label={tc("summaryBloodType")} value={bloodType ?? null} />
        </View>

        {/* Right: ASA + risk scores */}
        <View style={{ width: 116, alignItems: "center" }}>
          {preop.asaScore ? (
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <View style={{
                width: 54, height: 54, borderRadius: 999, alignItems: "center", justifyContent: "center",
                backgroundColor: withAlpha(asaColor(preop.asaScore), "22"),
                borderWidth: 2, borderColor: withAlpha(asaColor(preop.asaScore), "88"),
              }}>
                <Text style={{ color: asaColor(preop.asaScore), fontSize: 18, fontWeight: "900" }}>
                  {preop.asaScore}{preop.emergencySurgery ? "E" : ""}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 3 }}>ASA</Text>
            </View>
          ) : null}

          {riskItems.map(it => {
            const c = riskColor(it.level)
            return (
              <View key={it.label} style={{ alignItems: "center", marginBottom: 8, width: "100%" }}>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                  backgroundColor: withAlpha(c, "22"), borderWidth: 1, borderColor: withAlpha(c, "55"),
                  width: "100%", alignItems: "center",
                }}>
                  <Text style={{ color: c, fontSize: 13, fontWeight: "800" }}>
                    {it.score}/{it.max}
                  </Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 10, textAlign: "center", marginTop: 2 }}>
                  {it.label}
                </Text>
                <Text style={{ color: c, fontSize: 9, textAlign: "center" }}>
                  {it.risk}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      {(preop.emergencySurgery || preop.highRiskSurgery) && (
        <ChipRow>
          {preop.emergencySurgery && <Chip label={t("emergencyChip")} color={colors.danger} />}
          {preop.highRiskSurgery && <Chip label={t("highRiskChip")} color={colors.warning} />}
        </ChipRow>
      )}

      <Divider />

      <InfoRow label={tc("summaryDiagnosis")} value={diagLabel ?? null} />
      <InfoRow label={tc("summaryProcedure")} value={procLabel ?? null} />

      {vitals.length > 0 && (
        <View style={{ marginTop: 4 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, marginBottom: 4,
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            {tc("summaryPreopVitals")}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
            {vitals.join("  ·  ")}
          </Text>
          {preop.heartArrhythmia && (
            <Text style={{ color: colors.warning, fontSize: 11, marginTop: 2 }}>{tc("summaryArrhythmia")}</Text>
          )}
        </View>
      )}

      {preop.teamNotes ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: "italic" }}>
            {preop.teamNotes}
          </Text>
        </View>
      ) : null}
    </SummaryCard>
  )
}

// ─── Card 2: Medical History ──────────────────────────────────────────────────

function MedicalHistoryCard({ preop, tc }: { preop: CaseData["preop"]; tc: (key: ClinicalStringKey) => string }) {
  const comorbidities = preop?.comorbidities ?? []
  const currentMedicationsText = (() => {
    const raw = preop?.currentMedications
    if (!raw) return null
    const trimmed = raw.trim()
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown[]
        return parsed
          .map((item) => {
            const med = item as { label?: unknown; inn?: unknown; name?: unknown }
            return med.label ?? med.inn ?? med.name
          })
          .filter((label): label is string => typeof label === "string" && label.length > 0)
          .join(", ")
      } catch {}
    }
    return raw
  })()

  const flags: { label: string; color: string }[] = []
  if (preop?.allergies) flags.push({ label: tc("summaryAllergy"), color: colors.danger })
  if (preop?.latexAllergy) flags.push({ label: tc("summaryLatex"), color: colors.danger })
  if (preop?.familyAnesthesiaProblems) flags.push({ label: tc("summaryFamilyHx"), color: colors.warning })
  if (preop?.smoking) flags.push({ label: tc("summarySmoking"), color: colors.warning })
  if (preop?.substanceAbuse) flags.push({ label: tc("summarySubstance"), color: colors.warning })
  if (preop?.dentalProsthetics) flags.push({ label: tc("summaryDental"), color: colors.warning })
  if (preop?.looseTeeth) flags.push({ label: tc("summaryLooseTeeth"), color: colors.warning })

  const hasContent = comorbidities.length > 0 || flags.length > 0
    || !!currentMedicationsText || !!preop?.allergyDetails
    || !!preop?.familyAnesthesiaDetails

  if (!hasContent) {
    return (
      <SummaryCard title={tc("cardHistory")}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("noHistoryRecorded")}</Text>
      </SummaryCard>
    )
  }

  const grouped: Record<string, Comorbidity[]> = {}
  for (const c of comorbidities) {
    const sys = getBodySystem(c.code ?? "")
    if (!grouped[sys]) grouped[sys] = []
    grouped[sys].push(c)
  }

  return (
    <SummaryCard title={tc("cardHistory")} badge={comorbidities.length > 0 ? comorbidities.length : undefined}>
      {SYSTEM_ORDER.filter(sys => grouped[sys]?.length).map(sys => {
        const col = BODY_SYSTEM_COLORS[sys]
        const sysTcKey = BODY_SYSTEM_TC[sys]
        return (
          <View key={sys} style={{ marginBottom: 10 }}>
            <Text style={{
              color: col, fontSize: 10, fontWeight: "800",
              textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4,
            }}>
              {sysTcKey ? tc(sysTcKey) : sys}
            </Text>
            <ChipRow>
              {grouped[sys].map((c, i) => (
                <Chip key={`${c.code ?? c.label}-${i}`} label={c.label} color={col} />
              ))}
            </ChipRow>
          </View>
        )
      })}

      {flags.length > 0 && (
        <View>
          <Divider />
          <ChipRow>
            {flags.map((f, i) => <Chip key={`flag-${i}`} label={f.label} color={f.color} />)}
          </ChipRow>
        </View>
      )}

      {preop?.allergyDetails ? (
        <View style={{ marginTop: 6 }}>
          <Text style={{ color: colors.danger, fontSize: 12 }}>
            {tc("summaryAllergyDetails")}: {preop.allergyDetails}
          </Text>
        </View>
      ) : null}

      {preop?.familyAnesthesiaDetails ? (
        <View style={{ marginTop: 6 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: "italic" }}>
            {tc("summaryFamilyDetails")}: {preop.familyAnesthesiaDetails}
          </Text>
        </View>
      ) : null}

      {currentMedicationsText ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 4,
          }}>
            {tc("summaryCurrentMeds")}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
            {currentMedicationsText}
          </Text>
        </View>
      ) : null}
    </SummaryCard>
  )
}

// ─── Card 3: Airway Assessment ────────────────────────────────────────────────

function AirwayCard({ preop, tc }: { preop: CaseData["preop"]; tc: (key: ClinicalStringKey) => string }) {
  const mallampatiColor = (v?: string): string => {
    if (!v) return colors.textMuted
    if (v === "I") return colors.success
    if (v === "II") return "#fbbf24"
    if (v === "III") return colors.warning
    if (v === "IV") return colors.danger
    return colors.textPrimary
  }

  const neckColor = (v?: string): string => {
    if (!v) return colors.textMuted
    if (v === "FULL") return colors.success
    if (v === "LIMITED") return colors.warning
    if (v === "FIXED") return colors.danger
    return colors.textPrimary
  }

  const ulbtLabel = (v?: string): string | null => {
    if (!v) return null
    if (v === "CLASS_I") return "Class I"
    if (v === "CLASS_II") return "Class II"
    if (v === "CLASS_III") return "Class III"
    return v
  }

  const features: string[] = []
  if (preop?.retrognathia) features.push(tc("summaryRetro"))
  if (preop?.prominentIncisors) features.push(tc("summaryIncisors"))
  if (preop?.facialHair) features.push(tc("summaryFacialHair"))

  const hasData = preop?.mallampati || preop?.mouthOpeningCm != null
    || preop?.thyromental != null || preop?.neckMobility
    || preop?.upperLipBiteTest || preop?.cormackLehane
    || features.length > 0 || preop?.difficultAirwayHistory

  if (!hasData) {
    return (
      <SummaryCard title={tc("cardAirwayAssessment")}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("notAssessed")}</Text>
      </SummaryCard>
    )
  }

  return (
    <SummaryCard title={tc("cardAirwayAssessment")}>
      {preop?.difficultAirwayHistory && (
        <View style={{
          borderWidth: 1, borderColor: withAlpha(colors.danger, "66"),
          borderRadius: 10, padding: 10, marginBottom: 12,
          backgroundColor: withAlpha(colors.danger, "11"),
        }}>
          <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "700" }}>
            {"⚠️"} {tc("summaryDifficultAirway")}
          </Text>
          {preop.difficultAirwayNotes ? (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
              {preop.difficultAirwayNotes}
            </Text>
          ) : null}
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <InfoRow
            label={tc("summaryMallampati")}
            value={preop?.mallampati ?? null}
            valueColor={mallampatiColor(preop?.mallampati)}
          />
          <InfoRow
            label={tc("summaryMouthOpening")}
            value={preop?.mouthOpeningCm != null ? `${preop.mouthOpeningCm} cm` : null}
          />
          <InfoRow
            label={tc("summaryThyromental")}
            value={preop?.thyromental != null ? `${preop.thyromental} cm` : null}
          />
        </View>
        <View style={{ flex: 1 }}>
          <InfoRow
            label={tc("summaryNeckMobility")}
            value={preop?.neckMobility ?? null}
            valueColor={neckColor(preop?.neckMobility)}
          />
          <InfoRow
            label="ULBT"
            value={ulbtLabel(preop?.upperLipBiteTest)}
          />
          <InfoRow
            label={tc("summaryCL")}
            value={preop?.cormackLehane ?? null}
          />
        </View>
      </View>

      {features.length > 0 && (
        <ChipRow>
          {features.map((f, i) => <Chip key={`af-${i}`} label={f} color={colors.warning} />)}
        </ChipRow>
      )}
    </SummaryCard>
  )
}

// ─── Card 4: Intraoperative ───────────────────────────────────────────────────

function legacyKeyEventsToSummaryLog(keyEvents: unknown): KeyEvent[] {
  const kev = (keyEvents ?? {}) as Record<string, unknown>
  const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {}
  const out: KeyEvent[] = []
  if (Array.isArray(kev.drugs)) {
    kev.drugs.forEach(item => {
      const d = asRecord(item)
      out.push({ type: "drug", name: d.name as string | undefined, dose: d.dose as number | string | undefined, unit: d.unit as string | undefined, col: Number(d.colIdx ?? 0) })
    })
  }
  if (Array.isArray(kev.infusions)) {
    kev.infusions.forEach(item => {
      const inf = asRecord(item)
      const infId = String(inf.id ?? inf.name ?? "")
      if (!infId) return
      out.push({ type: "infusion_start", infId, name: inf.name as string | undefined, rate: inf.rate as number | string | undefined, unit: inf.unit as string | undefined, col: Number(inf.startCol ?? 0) })
      if (Array.isArray(inf.rateChanges)) {
        inf.rateChanges.forEach(changeItem => {
          const change = asRecord(changeItem)
          out.push({ type: "infusion_rate", infId, name: inf.name as string | undefined, rate: change.rate as number | string | undefined, unit: (change.unit ?? inf.unit) as string | undefined, col: Number(change.col ?? inf.startCol ?? 0) })
        })
      }
      if (inf.stopped) out.push({ type: "infusion_stop", infId, name: inf.name as string | undefined, col: Number(inf.endCol ?? inf.startCol ?? 0) })
    })
  }
  return out.sort((a, b) => (b.col ?? 0) - (a.col ?? 0))
}

function IntraopCard({ intraop, preop, tc, t }: { intraop: CaseData["intraop"]; preop?: CaseData["preop"]; tc: (key: ClinicalStringKey) => string; t: (key: TranslationKey) => string }) {
  if (!intraop) {
    return (
      <SummaryCard title={tc("cardIntraop")}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("noIntraopData")}</Text>
      </SummaryCard>
    )
  }

  const log = intraop.keyEvents?.log ?? legacyKeyEventsToSummaryLog(intraop.keyEvents)
  const drugTotals = calcDrugTotals(log)
  const activeInfusions = getActiveInfusions(log)

  // Compute IBW/TBW for weight-adjusted infusion totals
  const summaryIBW = intraop != null && preop?.heightCm && preop?.sex ? calcIBW(preop.sex, preop.heightCm) : null
  const summaryTBW = preop?.weightKg ?? null
  // Build infusion segments from timetable for total calculation
  const timetableInfusions = (() => {
    const infMap: Record<string, { name: string; rate: string; unit: string; startCol: number; endCol: number; rateChanges: { col: number; rate: string; unit: string }[] }> = {}
    const chrono = [...log].reverse()
    let maxCol = 0
    for (const ev of chrono) {
      const col = typeof ev.col === "number" ? ev.col : 0
      if (col > maxCol) maxCol = col
      if (ev.type === "infusion_start" && ev.infId) {
        infMap[ev.infId] = { name: ev.name ?? "Infusion", rate: String(ev.rate ?? 0), unit: ev.unit ?? "", startCol: col, endCol: col, rateChanges: [] }
      } else if (ev.type === "infusion_rate" && ev.infId && infMap[ev.infId]) {
        infMap[ev.infId].rateChanges.push({ col, rate: String(ev.rate ?? 0), unit: ev.unit ?? infMap[ev.infId].unit })
        infMap[ev.infId].rate = String(ev.rate ?? 0)
      } else if (ev.type === "infusion_stop" && ev.infId && infMap[ev.infId]) {
        infMap[ev.infId].endCol = col
      }
    }
    // Open-ended infusions extend to maxCol
    for (const entry of Object.values(infMap)) {
      if (entry.endCol === entry.startCol && maxCol > entry.startCol) entry.endCol = maxCol
    }
    return Object.values(infMap)
  })()
  const infusionTotals = calcInfusionTotals(timetableInfusions, summaryIBW, summaryTBW)
  const infWeightNote = (() => {
    const weighted = infusionTotals.filter(r => r.weightUsed != null)
    if (!weighted.length) return null
    const ibwUsed = weighted.some(r => r.weightBasis === "IBW") ? summaryIBW : null
    const tbwUsed = weighted.some(r => r.weightBasis === "TBW") ? summaryTBW : null
    const parts: string[] = []
    if (ibwUsed) parts.push(`IBW ${Math.round(ibwUsed * 10) / 10} kg`)
    if (tbwUsed) parts.push(`TBW ${Math.round((tbwUsed ?? 0) * 10) / 10} kg`)
    return parts.length ? `† ${parts.join(" / ")}` : null
  })()

  const airwayStr = formatAirway(intraop)
  const airwayTools = (intraop.airwayTools ?? []).map(t => AIRWAY_TOOL_LABELS[t] ?? t)

  const monitors = MONITOR_MAP.filter(m => {
    const val = (intraop as Record<string, unknown>)[m.key as string]
    return !!val
  })

  const positions = (intraop.positions ?? []).map(p => POSITION_LABELS[p] ?? p)
  const ventText = (intraop.ventilationModes ?? []).join(" + ")

  let timingStr = ""
  if (intraop.startTime && intraop.endTime) {
    timingStr = `${formatTimeHHMM(intraop.startTime)} → ${formatTimeHHMM(intraop.endTime)}`
    if (intraop.durationMinutes) timingStr += `  ·  ${formatDuration(intraop.durationMinutes)}`
  } else if (intraop.durationMinutes) {
    timingStr = formatDuration(intraop.durationMinutes)
  }

  const volatileStr = intraop.volatileAgent ?? null

  return (
    <SummaryCard title={tc("cardIntraop")}>
      {/* Technique */}
      {(intraop.techniques?.length ?? 0) > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 6,
          }}>
            {tc("summaryTechnique")}
          </Text>
          <ChipRow>
            {intraop.techniques!.map((t, i) => (
              <Chip key={`tech-${i}`} label={techniqueLabel(t)} color={colors.primary} />
            ))}
          </ChipRow>
        </View>
      )}

      {airwayStr ? <InfoRow label={tc("summaryAirwayDevice")} value={airwayStr} /> : null}

      {airwayTools.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 4 }}>{tc("summaryAirwayTools")}</Text>
          <ChipRow>
            {airwayTools.map((t, i) => <Chip key={`at-${i}`} label={t} color={colors.textSecondary} />)}
          </ChipRow>
        </View>
      )}

      {ventText ? <InfoRow label={tc("summaryVentilation")} value={ventText} /> : null}
      {volatileStr ? <InfoRow label={tc("summaryAgent")} value={volatileStr} valueColor={colors.agent} /> : null}

      {positions.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <ChipRow>
            {positions.map((p, i) => <Chip key={`pos-${i}`} label={p} color={colors.textSecondary} />)}
          </ChipRow>
        </View>
      )}

      {timingStr ? <InfoRow label={tc("summaryDuration")} value={timingStr} /> : null}
      {intraop.monthYear ? <InfoRow label={tc("summaryDate")} value={intraop.monthYear} /> : null}

      <Divider />

      {/* Monitoring */}
      {monitors.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 6,
          }}>
            {tc("summaryMonitoring")}
          </Text>
          <ChipRow>
            {monitors.map(m => <Chip key={String(m.key)} label={m.label} color={colors.primary} />)}
          </ChipRow>
        </View>
      )}

      {/* Vascular access */}
      {(intraop.vascularAccesses?.length ?? 0) > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 6,
          }}>
            {tc("summaryVascular")}
          </Text>
          <ChipRow>
            {intraop.vascularAccesses!.map((va, i) => {
              const lbl = `${va.siteLabel} ${va.size}${va.sizeUnit}${va.lumens ? ` ${va.lumens}L` : ""}${va.preexisting ? " (pre-existing)" : ""}`
              return <Chip key={`va-${i}`} label={lbl} color={colors.textSecondary} />
            })}
          </ChipRow>
        </View>
      )}

      <Divider />

      {intraop.premedicationEvening ? <InfoRow label={tc("summaryPremedEve")} value={intraop.premedicationEvening} /> : null}
      {intraop.premedicationMorning ? <InfoRow label={tc("summaryPremedAM")} value={intraop.premedicationMorning} /> : null}

      {/* Drug totals — bolus */}
      {drugTotals.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            {tc("summaryBolusDrugs")}
          </Text>
          {drugTotals.map((d, i) => (
            <View key={`dt-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: withAlpha(colors.border, "66") }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{d.name}</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700" }}>{d.total} {d.unit}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Infusion totals — weight-adjusted where applicable */}
      {infusionTotals.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            {tc("summaryInfTotals")}
          </Text>
          {infusionTotals.map((d, i) => (
            <View key={`it-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: withAlpha(colors.border, "66") }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{d.name}</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700" }}>
                {d.total} {d.unit}
                {d.weightUsed != null ? <Text style={{ color: colors.warning, fontSize: 10 }}> †</Text> : null}
              </Text>
            </View>
          ))}
          {infWeightNote && (
            <Text style={{ color: colors.textMuted, fontSize: 10, fontStyle: "italic", marginTop: 6 }}>{infWeightNote}</Text>
          )}
        </View>
      )}

      {/* Active infusions */}
      {activeInfusions.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 6,
          }}>
            {t("infusions")}
          </Text>
          {activeInfusions.map((inf, i) => (
            <View key={`inf-${i}`} style={{
              flexDirection: "row", justifyContent: "space-between",
              paddingVertical: 5, borderBottomWidth: 1,
              borderBottomColor: withAlpha(colors.border, "66"),
            }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{inf.name}</Text>
              <Text style={{ color: colors.agent, fontSize: 12, fontWeight: "700" }}>
                {inf.rate} {inf.unit}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Divider />

      {/* Fluid balance */}
      <Text style={{
        color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
        letterSpacing: 0.5, marginBottom: 8,
      }}>
        {tc("summaryFluidBalance")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([
          { labelKey: "summaryCrystalloid" as ClinicalStringKey, value: intraop.crystalloidsMl ?? 0, color: colors.primary },
          { labelKey: "summaryColloid" as ClinicalStringKey, value: intraop.colloidsMl ?? 0, color: "#38bdf8" },
          { labelKey: "summaryBlood" as ClinicalStringKey, value: intraop.bloodMl ?? 0, color: colors.danger },
          { labelKey: "summaryUrineOut" as ClinicalStringKey, value: intraop.urineMl ?? 0, color: "#2dd4bf" },
        ]).map(item => (
          <View key={item.labelKey} style={{
            flex: 1, minWidth: 72,
            backgroundColor: withAlpha(item.color, "11"),
            borderWidth: 1, borderColor: withAlpha(item.color, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{ color: item.color, fontSize: 16, fontWeight: "800" }}>{item.value}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
              {tc(item.labelKey)} mL
            </Text>
          </View>
        ))}
      </View>

      {intraop.bloodProductsNote ? (
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, fontStyle: "italic" }}>
          {intraop.bloodProductsNote}
        </Text>
      ) : null}

      {intraop.complications ? (
        <View style={{ marginTop: 10 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 4,
          }}>
            {tc("summaryComplications")}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
            {intraop.complications}
          </Text>
        </View>
      ) : null}
    </SummaryCard>
  )
}

// ─── Card 5: Postoperative Recovery ──────────────────────────────────────────

type AldreteCriterion = {
  field: keyof NonNullable<CaseData["postop"]>
  label: string
  descriptions: [string, string, string]
}

function PostopCard({ postop, tc, t }: { postop: CaseData["postop"]; tc: (key: ClinicalStringKey) => string; t: (key: TranslationKey) => string }) {
  const ALDRETE_CRITERIA: AldreteCriterion[] = [
    { field: "aldreteActivity", label: tc("aldreteActivity"), descriptions: [tc("aldreteNoMovement"), tc("aldrete2Extremities"), tc("aldreteAllExtremities")] },
    { field: "aldreteRespiration", label: tc("aldreteRespiration"), descriptions: [tc("aldreteApnoeic"), tc("aldreteShallow"), tc("aldreteDeepBreath")] },
    { field: "aldreteCirculation", label: tc("aldreteCirculation"), descriptions: [tc("aldreteBP50"), tc("aldreteBP20to49"), tc("aldreteBP20")] },
    { field: "aldreteConsciousness", label: tc("aldreteConsciousness"), descriptions: [tc("aldreteNoResponse"), tc("aldreteArousable"), tc("aldreteAwake")] },
    { field: "aldreteSpO2", label: tc("aldreteSpO2"), descriptions: [tc("aldreteSpO2Low"), tc("aldreteSpO2Mid"), tc("aldreteSpO2High")] },
  ]

  if (!postop) {
    return (
      <SummaryCard title={tc("cardPostop")} defaultOpen={false}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("notYetRecorded")}</Text>
      </SummaryCard>
    )
  }

  const total = postop.aldreteTotal ?? (
    (postop.aldreteActivity ?? 0)
    + (postop.aldreteRespiration ?? 0)
    + (postop.aldreteCirculation ?? 0)
    + (postop.aldreteConsciousness ?? 0)
    + (postop.aldreteSpO2 ?? 0)
  )
  const totalColor = total >= 9 ? colors.success : total >= 7 ? colors.warning : colors.danger
  const totalLabel = total >= 9 ? tc("summaryReady") : total >= 7 ? tc("summaryMonitor") : tc("summaryContinueRecovery")

  const dispColor = (d?: string): string => {
    if (d === "WARD") return colors.success
    if (d === "PACU") return colors.warning
    if (d === "ICU") return colors.danger
    return colors.textMuted
  }

  return (
    <SummaryCard title={tc("cardPostop")} defaultOpen={false}>
      {ALDRETE_CRITERIA.map(c => (
        <AldreteRow
          key={String(c.field)}
          label={c.label}
          value={postop[c.field] as number | undefined}
          descriptions={c.descriptions}
        />
      ))}

      {/* Total */}
      <View style={{
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingVertical: 12,
      }}>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800" }}>
          {tc("summaryAldrete")}
        </Text>
        <View style={{
          paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
          backgroundColor: withAlpha(totalColor, "22"),
          borderWidth: 1, borderColor: withAlpha(totalColor, "66"),
        }}>
          <Text style={{ color: totalColor, fontSize: 14, fontWeight: "900" }}>
            {total}/10 — {totalLabel}
          </Text>
        </View>
      </View>

      <Divider />

      {/* Recovery metrics */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {postop.recoveryBpSystolic != null && postop.recoveryBpDiastolic != null && (
          <View style={{
            flex: 1, minWidth: 92,
            backgroundColor: withAlpha(colors.danger, "11"),
            borderWidth: 1, borderColor: withAlpha(colors.danger, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{ color: colors.danger, fontSize: 16, fontWeight: "800" }}>
              {postop.recoveryBpSystolic}/{postop.recoveryBpDiastolic}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>BP mmHg</Text>
          </View>
        )}
        {postop.recoveryHeartRate != null && (
          <View style={{
            flex: 1, minWidth: 70,
            backgroundColor: withAlpha(colors.success, "11"),
            borderWidth: 1, borderColor: withAlpha(colors.success, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{ color: colors.success, fontSize: 16, fontWeight: "800" }}>{postop.recoveryHeartRate}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>HR bpm</Text>
          </View>
        )}
        {postop.recoverySpO2 != null && (
          <View style={{
            flex: 1, minWidth: 70,
            backgroundColor: withAlpha(colors.primary, "11"),
            borderWidth: 1, borderColor: withAlpha(colors.primary, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "800" }}>{postop.recoverySpO2}%</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>SpO₂</Text>
          </View>
        )}
        {postop.temperatureCelsius != null && (
          <View style={{
            flex: 1, minWidth: 70,
            backgroundColor: withAlpha(colors.temp, "11"),
            borderWidth: 1, borderColor: withAlpha(colors.temp, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{ color: colors.temp, fontSize: 16, fontWeight: "800" }}>
              {postop.temperatureCelsius}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>Temp °C</Text>
          </View>
        )}
        {postop.painScoreNRS != null && (
          <View style={{
            flex: 1, minWidth: 70,
            backgroundColor: withAlpha(colors.warning, "11"),
            borderWidth: 1, borderColor: withAlpha(colors.warning, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{ color: colors.warning, fontSize: 16, fontWeight: "800" }}>
              {postop.painScoreNRS}/10
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{tc("summaryPain")} NRS</Text>
          </View>
        )}
        {postop.ponv != null && (
          <View style={{
            flex: 1, minWidth: 60,
            backgroundColor: withAlpha(postop.ponv ? colors.danger : colors.textMuted, "11"),
            borderWidth: 1, borderColor: withAlpha(postop.ponv ? colors.danger : colors.textMuted, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{
              color: postop.ponv ? colors.danger : colors.textMuted,
              fontSize: 14, fontWeight: "800",
            }}>
              {postop.ponv ? t("yesLabel") : t("noLabel")}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{tc("summaryPONV")}</Text>
          </View>
        )}
      </View>

      {postop.disposition && (
        <View style={{
          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, alignSelf: "flex-start",
          backgroundColor: withAlpha(dispColor(postop.disposition), "22"),
          borderWidth: 1, borderColor: withAlpha(dispColor(postop.disposition), "55"),
          marginBottom: 10,
        }}>
          <Text style={{
            color: dispColor(postop.disposition), fontSize: 13, fontWeight: "800",
          }}>
            {tc("summaryDischarge")}: {postop.disposition}
          </Text>
        </View>
      )}

      {(postop.handoverItems?.length ?? 0) > 0 && (
        <View>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 6,
          }}>
            {tc("summaryHandover")}
          </Text>
          {postop.handoverItems!.map((item, i) => (
            <View key={`hi-${i}`} style={{
              flexDirection: "row", alignItems: "center",
              paddingVertical: 4, gap: 8,
            }}>
              <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: colors.success }} />
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {formatHandoverItem(item)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </SummaryCard>
  )
}

// ─── Card 6: Laboratory Results ───────────────────────────────────────────────

function LabCard({ labResults, tc }: { labResults?: LabResult[]; tc: (key: ClinicalStringKey) => string }) {
  if (!labResults?.length) {
    return (
      <SummaryCard title={tc("cardLabs")} defaultOpen={false}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("noLabResults")}</Text>
      </SummaryCard>
    )
  }

  const numCols = labResults.length <= 9 ? 1 : labResults.length <= 15 ? 2 : 3
  const columns: LabResult[][] = Array.from({ length: numCols }, () => [])
  labResults.forEach((item, i) => columns[i % numCols].push(item))

  return (
    <SummaryCard title={tc("cardLabs")} badge={labResults.length} defaultOpen={false}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {columns.map((col, ci) => (
          <View key={`col-${ci}`} style={{ flex: 1 }}>
            {col.map((lab, li) => (
              <View key={`lab-${ci}-${li}`} style={{
                flexDirection: "row", justifyContent: "space-between",
                paddingVertical: 5, borderBottomWidth: 1,
                borderBottomColor: withAlpha(colors.border, "77"),
              }}>
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700", flex: 1 }}>
                  {lab.test}
                </Text>
                <Text style={{ color: colors.textPrimary, fontSize: 11, fontWeight: "600" }}>
                  {lab.value}{lab.unit ? ` ${lab.unit}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </SummaryCard>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CaseSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { tc, t } = usePreferences()
  const [caseData, setCaseData] = useState<CaseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unfinalizing, setUnfinalizing] = useState(false)

  const loadCase = useCallback(async () => {
    try {
      setError(null)
      const data = await apiJson<CaseData>(`/api/cases/${id}`)
      setCaseData(data)
    } catch {
      setError(tc("caseLoadFailed"))
    } finally {
      setLoading(false)
    }
  }, [id, tc])

  useEffect(() => { loadCase() }, [loadCase])

  const editWindowOpen = useMemo(() => {
    if (!caseData?.finalizedAt) return true
    return Date.now() - new Date(caseData.finalizedAt).getTime() < 30 * 60 * 1000
  }, [caseData?.finalizedAt])

  const canEdit = caseData?.status !== "COMPLETE" || editWindowOpen

  const handleUnfinalize = useCallback(() => {
    Alert.alert(
      t("unfinalizeCase"),
      t("unfinalizeCaseMsg"),
      [
        { text: tc("cancelLabel"), style: "cancel" },
        {
          text: tc("actionUnfinalize"),
          style: "destructive",
          onPress: async () => {
            setUnfinalizing(true)
            try {
              await apiFetch(`/api/cases/${id}/unfinalize`, { method: "POST" })
              await loadCase()
            } catch {
              Alert.alert(tc("errorLabel"), t("couldNotUnfinalize"))
            } finally {
              setUnfinalizing(false)
            }
          },
        },
      ]
    )
  }, [id, loadCase, t, tc])

  const handleDelete = useCallback(() => {
    Alert.alert(
      t("deleteCaseTitle"),
      t("deleteCaseMsg"),
      [
        { text: tc("cancelLabel"), style: "cancel" },
        {
          text: tc("actionDelete"),
          style: "destructive",
          onPress: async () => {
            try {
              await apiFetch(`/api/cases/${id}`, { method: "DELETE" })
              router.back()
            } catch {
              Alert.alert(tc("errorLabel"), t("couldNotDelete"))
            }
          },
        },
      ]
    )
  }, [id, router, t, tc])

  const screenTitle = caseData?.caseCode ?? (loading ? "…" : tc("cardPreop"))

  const procedureTitle = caseData?.preop?.proceduresJson?.[0]?.label
    ?? caseData?.preop?.plannedProcedure
    ?? t("caseDetails")

  const diagnosisSubtitle = caseData?.preop?.diagnosesJson?.[0]?.label
    ?? caseData?.preop?.diagnosis

  const metaParts: string[] = []
  if (caseData?.preop?.ageYears != null) metaParts.push(`${caseData.preop.ageYears} yr`)
  if (caseData?.preop?.sex) {
    const sx = caseData.preop.sex === "MALE" ? "M" : caseData.preop.sex === "FEMALE" ? "F" : caseData.preop.sex
    metaParts.push(sx)
  }
  if (caseData?.preop?.asaScore) metaParts.push(`ASA ${caseData.preop.asaScore}`)
  if (caseData?.intraop?.monthYear) metaParts.push(caseData.intraop.monthYear)

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppHeader eyebrow="LOSPOR" title="Case" showNewCase={false} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{tc("loadingCase")}</Text>
        </View>
      </View>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !caseData) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppHeader eyebrow="LOSPOR" title="Case" showNewCase={false} />
        <View style={{
          flex: 1, alignItems: "center", justifyContent: "center",
          paddingHorizontal: 32, gap: 16,
        }}>
          <Text style={{
            color: colors.danger, fontSize: 16, fontWeight: "700", textAlign: "center",
          }}>
            {error ?? t("caseNotFound")}
          </Text>
          <TouchableOpacity
            onPress={loadCase}
            style={{
              paddingHorizontal: 24, paddingVertical: 10, borderRadius: 999,
              backgroundColor: withAlpha(colors.primary, "22"),
              borderWidth: 1, borderColor: withAlpha(colors.primary, "66"),
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "700" }}>{t("retry")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────
  const displayStatus = computedDisplayStatus(caseData)
  const sc = STATUS_META[displayStatus]?.color ?? colors.textMuted
  const statusLabel = STATUS_META[displayStatus]?.label ?? displayStatus

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader eyebrow="LOSPOR" title={screenTitle} showNewCase={false} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, paddingTop: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status + meta row */}
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <View style={{
            paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
            backgroundColor: withAlpha(sc, "22"),
            borderWidth: 1, borderColor: withAlpha(sc, "66"),
          }}>
            <Text style={{
              color: sc, fontSize: 11, fontWeight: "800",
              textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              {statusLabel}
            </Text>
          </View>
          {caseData.caseCode ? (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{caseData.caseCode}</Text>
          ) : null}
          {caseData.user?.institution?.name ? (
            <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
              {caseData.user.institution.name}
              {caseData.user.institution.city ? `, ${caseData.user.institution.city}` : ""}
            </Text>
          ) : null}
        </View>

        {/* ── Hero bar ───────────────────────────────────────────────────────── */}
        <View style={{
          backgroundColor: colors.surfaceRaised, borderRadius: 16,
          borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12,
        }}>
          <Text style={{
            color: colors.textPrimary, fontSize: 20, fontWeight: "900", lineHeight: 26, marginBottom: 4,
          }} numberOfLines={2}>
            {procedureTitle}
          </Text>

          {diagnosisSubtitle ? (
            <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }} numberOfLines={2}>
              {diagnosisSubtitle}
            </Text>
          ) : null}

          {metaParts.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
              {metaParts.map((part, i) => (
                <View key={`meta-${i}`} style={{
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                  backgroundColor: withAlpha(colors.primary, "11"),
                  borderWidth: 1, borderColor: withAlpha(colors.primary, "33"),
                }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "600" }}>
                    {part}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Case finalised green banner */}
          {caseData.status === "COMPLETE" && !editWindowOpen && (
            <View style={{
              marginTop: 10, borderRadius: 10, padding: 10,
              backgroundColor: withAlpha(colors.success, "11"),
              borderWidth: 1, borderColor: withAlpha(colors.success, "55"),
            }}>
              <Text style={{ color: colors.success, fontSize: 12, fontWeight: "700" }}>
                {"✓"} {tc("caseFinalised")}
              </Text>
            </View>
          )}
        </View>

        {/* ── Edit window subheader (shown when case is finalised and window open) */}
        {caseData.finalizedAt != null && editWindowOpen && (
          <EditWindowBanner finalizedAt={caseData.finalizedAt} />
        )}

        {/* ── Action rail ────────────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 16 }}
          contentContainerStyle={{ paddingRight: 8 }}
        >
          <ActionButton
            label={`✏️ ${tc("actionPreop")}`}
            onPress={() => router.push(`/(app)/cases/new?continue=${id}`)}
            disabled={!canEdit}
          />
          <ActionButton
            label={`⚕️ ${tc("actionIntraop")}`}
            onPress={() => router.push(`/(app)/cases/intraop/${id}`)}
            disabled={!canEdit}
          />
          <ActionButton
            label={`🏥 ${tc("actionPostop")}`}
            onPress={() => router.push(`/(app)/cases/postop/${id}`)}
            disabled={!canEdit}
          />
          <ActionButton
            label={tc("actionPrintPDF")}
            onPress={() => {
              async function doPrint() {
                // Get a short-lived print token so the browser doesn't need a web login
                try {
                  const res = await apiFetch(`/api/cases/${id}/print-token`, { method: "POST" })
                  if (res.ok) {
                    const { url } = await res.json()
                    Linking.openURL(url).catch(() => Alert.alert(tc("errorLabel"), "Could not open browser"))
                    return
                  }
                } catch { /* fall through to direct URL */ }
                // Fallback: direct URL (requires web session)
                Linking.openURL(`${API_BASE}/cases/${id}`).catch(() => Alert.alert(tc("errorLabel"), "Could not open browser"))
              }

              if (caseData?.status !== "COMPLETE") {
                Alert.alert(
                  tc("actionFinalise"),
                  tc("finalisePrintPrompt"),
                  [
                    { text: tc("cancelLabel"), style: "cancel" },
                    {
                      text: tc("actionFinalisePrint"),
                      onPress: async () => {
                        try {
                          await apiFetch(`/api/cases/${id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ status: "COMPLETE" }),
                          })
                          setCaseData(prev => prev ? { ...prev, status: "COMPLETE", finalizedAt: new Date().toISOString() } : prev)
                        } catch { /* best-effort */ }
                        doPrint()
                      },
                    },
                  ]
                )
              } else {
                doPrint()
              }
            }}
            color={colors.textSecondary}
          />
          {caseData.status === "COMPLETE" && (
            <ActionButton
              label={unfinalizing ? `⏳ ${t("unfinalizing")}` : tc("actionUnfinalize")}
              onPress={handleUnfinalize}
              disabled={unfinalizing}
              color={colors.warning}
            />
          )}
          {caseData.status !== "COMPLETE" && (
            <ActionButton
              label={tc("actionDelete")}
              onPress={handleDelete}
              color={colors.danger}
            />
          )}
        </ScrollView>

        {/* ── Six summary cards ──────────────────────────────────────────────── */}
        <PreopCard preop={caseData.preop} tc={tc} t={t} />
        <MedicalHistoryCard preop={caseData.preop} tc={tc} />
        <AirwayCard preop={caseData.preop} tc={tc} />
        <IntraopCard intraop={caseData.intraop} preop={caseData.preop} tc={tc} t={t} />
        <PostopCard postop={caseData.postop} tc={tc} t={t} />
        <LabCard labResults={caseData.preop?.labResults} tc={tc} />
      </ScrollView>
    </View>
  )
}
