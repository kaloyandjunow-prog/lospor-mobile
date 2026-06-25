import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native"
import { hapticKey, hapticTick } from "@/lib/haptic"
import { Stack, useRouter, useLocalSearchParams, useFocusEffect } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ApiError, apiFetch, apiJson } from "@/lib/api"
import { saveCasePatchWithQueue } from "@/lib/offline-case-patches"
import { deleteLocalCaseDraft, loadLocalCaseDraft, makeLocalCaseId, saveLocalCaseDraft } from "@/lib/local-case-store"
import { buildPreopPayload } from "@/lib/preop-payload"
import {
  ChecklistGroup,
  ChecklistRow,
  ClinicalSwitchRow,
  Field,
  PrimaryButton,
  SectionHeader,
  StyledInput,
} from "@/components/ui"
import { SearchTagInput } from "@/components/SearchTagInput"
import { ClinicalNumberInput } from "@/components/ClinicalNumberInput"
import { convertedMeasurement } from "@/lib/use-converted-measurement"
import { LabScanPanel } from "@/components/LabScanPanel"
import { AiAdvisorPanel } from "@/components/AiAdvisorPanel"
import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { LAB_CATEGORIES, getLabOutOfRange, searchLabs, type LabTest } from "@/lib/labs"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"
import { useOptionLibrary, useRangeSpec } from "@/lib/use-option-library"
import { suggestRcriIschemicHeart, suggestRcriCHF, suggestRcriCVD, suggestRcriInsulinDM, suggestRcriCreatinine, suggestStopBangBP } from "@/lib/risk-derivation"

const schema = z.object({
  ageYears: z.number({ error: "Required" }).min(0).max(120),
  sex: z.enum(["MALE", "FEMALE", "OTHER"]),
  heightCm: z.number({ error: "Required" }).min(0).max(220),
  weightKg: z.number({ error: "Required" }).min(0).max(250),
  bloodType: z.enum(["A", "B", "AB", "O"]).optional(),
  rhFactor: z.enum(["POSITIVE", "NEGATIVE"]).optional(),

  diagnoses: z.array(z.object({ label: z.string(), code: z.string().optional(), system: z.string().optional(), labelEn: z.string().optional(), labelBg: z.string().optional() })).default([]),
  procedures: z.array(z.object({ label: z.string(), code: z.string().optional() })).default([]),
  highRiskSurgery: z.boolean().default(false),
  elective: z.boolean().default(false),
  emergencySurgery: z.boolean().default(false),

  comorbidities: z.array(z.object({ label: z.string(), code: z.string().optional(), sub: z.string().optional(), system: z.string().optional(), labelEn: z.string().optional(), labelBg: z.string().optional() })).default([]),
  currentMedications: z.array(z.object({ label: z.string(), inn: z.string().optional(), atcCode: z.string().optional() })).default([]),

  allergies: z.boolean().default(false),
  latexAllergy: z.boolean().default(false),
  allergyDetails: z.array(z.object({ label: z.string(), inn: z.string().optional(), atcCode: z.string().optional() })).default([]),
  familyAnesthesiaProblems: z.boolean().default(false),
  familyAnesthesiaDetails: z.string().max(500).optional(),
  dentalProsthetics: z.boolean().default(false),
  looseTeeth: z.boolean().default(false),
  smoking: z.boolean().default(false),
  substanceAbuse: z.boolean().default(false),

  bpSystolic: z.number().min(0).max(260).optional(),
  bpDiastolic: z.number().min(0).max(160).optional(),
  heartRate: z.number().min(0).max(250).optional(),
  heartArrhythmia: z.boolean().default(false),
  spO2: z.number().min(50).max(100).optional(),
  temperature: z.number().min(0).max(42).optional(),
  respiratoryRate: z.number().min(4).max(60).optional(),
  bpUnobtainable: z.boolean().default(false),
  heartRateUnobtainable: z.boolean().default(false),
  spO2Unobtainable: z.boolean().default(false),
  temperatureUnobtainable: z.boolean().default(false),
  respiratoryRateUnobtainable: z.boolean().default(false),
  physicalExamReport: z.string().max(500).optional(),

  mallampati: z.enum(["I", "II", "III", "IV"]).optional(),
  mouthOpeningCm: z.number().min(0.5).max(8).optional(),
  thyromental: z.number().min(3).max(12).optional(),
  neckMobility: z.enum(["FULL", "LIMITED", "FIXED"]).optional(),
  upperLipBiteTest: z.enum(["CLASS_I", "CLASS_II", "CLASS_III"]).optional(),
  cormackLehane: z.enum(["I", "IIa", "IIb", "III", "IV"]).optional(),
  retrognathia: z.boolean().default(false),
  prominentIncisors: z.boolean().default(false),
  facialHair: z.boolean().default(false),
  difficultAirwayHistory: z.boolean().default(false),
  difficultAirwayNotes: z.string().max(500).optional(),
  airwayUnobtainable: z.boolean().default(false),

  rcriIschemicHeart: z.boolean().default(false),
  rcriCHF: z.boolean().default(false),
  rcriCVD: z.boolean().default(false),
  rcriInsulinDM: z.boolean().default(false),
  rcriCreatinine: z.boolean().default(false),
  apfelPONVHistory: z.boolean().default(false),
  apfelPostopOpioids: z.boolean().default(false),
  stopbangSnoring: z.boolean().default(false),
  stopbangTired: z.boolean().default(false),
  stopbangObserved: z.boolean().default(false),
  stopbangBP: z.boolean().default(false),
  stopbangNeck: z.boolean().default(false),

  asaScore: z.enum(["I", "II", "III", "IV", "V", "VI"]),
  teamNotes: z.string().max(500).optional(),
  notes: z.string().optional(),
  aiOptIn: z.boolean().default(false),
  labResults: z.array(z.object({ test: z.string(), value: z.string(), unit: z.string() })).default([]),
})

type FormInput = z.input<typeof schema>
type FormData = z.output<typeof schema>
type PreopSection =
  | "patient"
  | "case"
  | "history"
  | "meds"
  | "anamnesis"
  | "exam"
  | "airway"
  | "labs"
  | "risk"

// SECTION_LABELS is built inside the component with translated strings via tc().

const SECTION_RAIL_EXPANDED_HEIGHT = 68

function impact() {
  hapticTick()
}

function SectionCard({ title, subtitle, children, onLayout, visible = true }: {
  title: string
  subtitle?: string
  children: React.ReactNode
  onLayout?: (y: number) => void
  visible?: boolean
}) {
  if (!visible) return null
  return (
    <View
      onLayout={(event) => onLayout?.(event.nativeEvent.layout.y)}
      style={{
        backgroundColor: colors.surfaceRaised,
        borderRadius: 18,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: 21, fontWeight: "900" }}>{title}</Text>
      {subtitle ? <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 12 }}>{subtitle}</Text> : <View style={{ height: 10 }} />}
      {children}
    </View>
  )
}

// ── ASA suggestion from comorbidity ICD-10 tags ──────────────────────────────
const ASA_RULES: [string, number, number, string][] = [
  ["N18.6",5,4,"End-stage renal disease (not on dialysis)"],
  ["N18.5",5,4,"Chronic kidney disease stage 5"],
  ["I50.2",5,4,"Systolic heart failure"],
  ["I50.3",5,4,"Diastolic heart failure"],
  ["I50",3,3,"Heart failure"],["I21",3,3,"Acute MI"],["I25",3,3,"Chronic ischaemic heart disease"],
  ["I63",3,3,"Cerebral infarction (stroke)"],["I64",3,3,"Stroke / CVA"],["G45",3,3,"TIA"],
  ["Z95.0",5,3,"Pacemaker / ICD"],["Z95.1",5,3,"Implanted cardiac device"],
  ["J44",3,3,"COPD"],["J45.5",5,3,"Severe persistent asthma"],
  ["E10",3,3,"Type 1 diabetes mellitus"],["K70.3",5,3,"Alcoholic liver cirrhosis"],
  ["K74",3,3,"Cirrhosis of liver"],["N18",3,3,"Chronic kidney disease"],
  ["Z99.2",5,3,"Dialysis"],["E66.9",5,3,"Morbid obesity"],
  ["G20",3,3,"Parkinson's disease"],["F10.2",5,3,"Alcohol dependence"],
  ["F19.2",5,3,"Substance dependence"],["Z86.7",5,3,"History of MI/stroke > 3 months"],
  ["I10",3,2,"Hypertension"],["I11",3,2,"Hypertensive heart disease"],
  ["I48",3,2,"Atrial fibrillation"],["I49",3,2,"Arrhythmia"],
  ["I73",3,2,"Peripheral vascular disease"],["I83",3,2,"Varicose veins / CVI"],
  ["I82",3,2,"DVT history"],["J45",3,2,"Asthma"],["J44",3,2,"COPD (mild)"],
  ["E11",3,2,"Type 2 diabetes mellitus"],["E03",3,2,"Hypothyroidism"],
  ["E05",3,2,"Hyperthyroidism"],["E04",3,2,"Thyroid disease"],
  ["G40",3,2,"Epilepsy"],["G43",3,2,"Migraine"],
  ["F32",3,2,"Depressive episode"],["F33",3,2,"Recurrent depression"],
  ["F41",3,2,"Anxiety disorder"],["K29",3,2,"Gastritis / peptic ulcer"],
  ["K57",3,2,"Diverticular disease"],["K21",3,2,"GERD"],
  ["K73",3,2,"Chronic hepatitis"],["K74",3,2,"Liver fibrosis"],
  ["N03",3,2,"Chronic glomerulonephritis"],["N11",3,2,"Chronic pyelonephritis"],
  ["D50",3,2,"Anaemia (iron deficiency)"],["D51",3,2,"Vitamin B12 deficiency anaemia"],
  ["D64",3,2,"Anaemia"],["M05",3,2,"Rheumatoid arthritis"],
  ["M06",3,2,"Rheumatoid arthritis"],["M81",3,2,"Osteoporosis"],
  ["Z87.3",5,2,"History of musculoskeletal disease"],["F17.2",5,2,"Nicotine dependence (smoker)"],
]

type ASASuggestion = { cls: "I"|"II"|"III"|"IV"; reasons: string[] }

function suggestASAFromTags(tags: { label: string; code?: string }[], bmi: number | null): ASASuggestion | null {
  if (tags.length === 0 && !bmi) return null
  const r4: string[] = [], r3: string[] = [], r2: string[] = []
  for (const tag of tags) {
    const code = (tag.code ?? "").toUpperCase()
    for (const [prefix, minLen, cls, label] of ASA_RULES) {
      if (code.startsWith(prefix.toUpperCase()) && code.length >= minLen) {
        if (cls === 4) r4.push(label)
        else if (cls === 3) { if (!r3.includes(label)) r3.push(label) }
        else if (cls === 2) { if (!r2.includes(label)) r2.push(label) }
        break
      }
    }
  }
  if (bmi && bmi >= 40) r3.push(`Morbid obesity (BMI ${bmi.toFixed(1)})`)
  else if (bmi && bmi >= 30) r2.push(`Obesity (BMI ${bmi.toFixed(1)})`)
  if (r4.length > 0) return { cls: "IV", reasons: r4 }
  if (r3.length > 0) return { cls: "III", reasons: r3.slice(0, 4) }
  if (r2.length > 0) return { cls: "II", reasons: r2.slice(0, 4) }
  if (tags.length > 0) return { cls: "II", reasons: ["Comorbidities present"] }
  return { cls: "I", reasons: [] }
}

const ASA_OPTS: { v: "I"|"II"|"III"|"IV"|"V"|"VI"; color: string }[] = [
  { v: "I",   color: "#22c55e" },
  { v: "II",  color: "#84cc16" },
  { v: "III", color: "#f59e0b" },
  { v: "IV",  color: "#f97316" },
  { v: "V",   color: "#ef4444" },
  { v: "VI",  color: "#64748b" },
]

function AsaPicker({
  value,
  onChange,
  emergencySurgery,
  suggestion,
  labelSuggested,
  labelSuggestedReview,
  labelEmergencySuffix,
}: {
  value?: string
  onChange: (v: string) => void
  emergencySurgery: boolean
  suggestion: ASASuggestion | null
  labelSuggested: string
  labelSuggestedReview: string
  labelEmergencySuffix: string
}) {
  return (
    <View style={{ gap: 8 }}>
      {suggestion && (
        <View style={{ backgroundColor: withAlpha("#3b82f6", "15"), borderRadius: 12, borderWidth: 1, borderColor: withAlpha("#3b82f6", "40"), paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}>
          <Text style={{ color: "#60a5fa", fontSize: 13, fontWeight: "800" }}>
            {labelSuggested} {suggestion.cls} {labelSuggestedReview}
          </Text>
          {suggestion.reasons.map((r) => (
            <Text key={r} style={{ color: "#60a5fa", fontSize: 12, opacity: 0.85 }}>• {r}</Text>
          ))}
        </View>
      )}
      {emergencySurgery && (
        <View style={{ backgroundColor: withAlpha(colors.danger, "10"), borderRadius: 10, borderWidth: 1, borderColor: withAlpha(colors.danger, "40"), paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>{labelEmergencySuffix}</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ASA_OPTS.map(({ v, color }) => {
          const selected = value === v
          const displayLabel = emergencySurgery && v !== "VI" ? `${v}E` : v
          return (
            <Pressable
              key={v}
              onPress={() => { impact(); onChange(value === v ? "" : v) }}
              style={{
                flex: 1, minWidth: 52, minHeight: 56,
                alignItems: "center", justifyContent: "center",
                borderRadius: 14, borderCurve: "continuous",
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? color : colors.border,
                backgroundColor: selected ? withAlpha(color, "22") : colors.surface,
              }}
            >
              <Text style={{ color: selected ? color : colors.textSecondary, fontSize: 15, fontWeight: "900", letterSpacing: -0.3 }}>
                {displayLabel}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function SegmentButton({ label, selected, onPress, flex = 1 }: { label: string; selected: boolean; onPress: () => void; flex?: number }) {
  return (
    <Pressable
      onPress={() => { impact(); onPress() }}
      style={{
        flex,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : colors.surface,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ color: selected ? colors.primary : colors.textSecondary, fontSize: 14, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  )
}

function SegmentedSelect<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]
  value?: T
  onChange: (value: T) => void
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {options.map((option) => (
        <SegmentButton key={option.value} label={option.label} selected={value === option.value} onPress={() => onChange(option.value)} />
      ))}
    </View>
  )
}

function BloodGrid({ bloodType, rhFactor, onChange }: {
  bloodType?: "A" | "B" | "AB" | "O"
  rhFactor?: "POSITIVE" | "NEGATIVE"
  onChange: (bloodType: "A" | "B" | "AB" | "O" | undefined, rhFactor: "POSITIVE" | "NEGATIVE" | undefined) => void
}) {
  const { options: bloodGroupOptions } = useOptionLibrary("BLOOD_GROUP")
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {bloodGroupOptions.map(opt => {
        const meta = opt.metadata as { bloodType: "A" | "B" | "AB" | "O"; rhFactor: "POSITIVE" | "NEGATIVE" } | undefined
        const selected = bloodType === meta?.bloodType && rhFactor === meta?.rhFactor
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              impact()
              onChange(selected ? undefined : meta?.bloodType, selected ? undefined : meta?.rhFactor)
            }}
            style={{
              width: "23%",
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primarySoft : colors.surface,
            }}
          >
            <Text style={{ color: selected ? colors.primary : colors.textSecondary, fontSize: 15, fontWeight: "900" }}>{opt.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Risk label helpers — identical thresholds to web lib/scores.ts
function rcriRiskLabel(s: number, tc: (k: ClinicalStringKey) => string) {
  return s === 0 ? tc("rcriVeryLow") : s === 1 ? tc("rcriLow") : s === 2 ? tc("rcriModerate") : tc("rcriHigh")
}
function apfelRiskLabel(s: number, tc: (k: ClinicalStringKey) => string) {
  return s <= 1 ? tc("apfelLow") : s === 2 ? tc("apfelModerate") : tc("apfelHigh")
}
function stopBangRiskLabel(s: number, tc: (k: ClinicalStringKey) => string) {
  return s <= 2 ? tc("osaLow") : s <= 4 ? tc("osaIntermediate") : tc("osaHigh")
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
  "Obstetric":                  "sysObstetric",
  "Congenital":                 "sysCongenital",
  "Other":                      "sysOther",
}

// ── ICD-10 body-system classification (mirrors web lib/icd-categories.ts) ──
type BodySystem = "Cardiovascular"|"Respiratory"|"Neurological / Psychiatric"|"Endocrine / Metabolic"|"Gastrointestinal / Hepatic"|"Renal / Urological"|"Haematological"|"Musculoskeletal"|"Neoplasms"|"Infectious diseases"|"Ophthalmological / ENT"|"Obstetric"|"Congenital"|"Other"

const SYSTEM_ORDER: BodySystem[] = [
  "Cardiovascular","Respiratory","Neurological / Psychiatric","Endocrine / Metabolic",
  "Gastrointestinal / Hepatic","Renal / Urological","Haematological","Musculoskeletal",
  "Neoplasms","Infectious diseases","Ophthalmological / ENT","Obstetric","Congenital","Other",
]

const SYSTEM_HEX: Record<BodySystem, string> = {
  "Cardiovascular":             "#ef4444",
  "Respiratory":                "#38bdf8",
  "Neurological / Psychiatric": "#a78bfa",
  "Endocrine / Metabolic":      "#fbbf24",
  "Gastrointestinal / Hepatic": "#f97316",
  "Renal / Urological":         "#2dd4bf",
  "Haematological":             "#fb7185",
  "Musculoskeletal":            "#84cc16",
  "Neoplasms":                  "#f472b6",
  "Infectious diseases":        "#d97706",
  "Ophthalmological / ENT":     "#22d3ee",
  "Obstetric":                  "#e879f9",
  "Congenital":                 "#818cf8",
  "Other":                      "#94a3b8",
}

function getBodySystem(code: string): BodySystem {
  if (!code) return "Other"
  const p2 = code.substring(0, 2).toUpperCase()
  // ICD-10 single-letter classification
  const p1 = p2.charAt(0), num = parseInt(code.substring(1, 3), 10) || 0
  if (p1 === "I") return "Cardiovascular"
  if (p1 === "J") return "Respiratory"
  if (p1 === "G" || p1 === "F") return "Neurological / Psychiatric"
  if (p1 === "E") return "Endocrine / Metabolic"
  if (p1 === "K") return "Gastrointestinal / Hepatic"
  if (p1 === "N") return "Renal / Urological"
  if (p1 === "D") return (num >= 50 && num <= 89) ? "Haematological" : "Neoplasms"
  if (p1 === "C") return "Neoplasms"
  if (p1 === "M") return "Musculoskeletal"
  if (p1 === "A" || p1 === "B") return "Infectious diseases"
  if (p1 === "H") return "Ophthalmological / ENT"
  if (p1 === "O") return "Obstetric"
  if (p1 === "Q") return "Congenital"
  return "Other"
}

function ComorbiditiesBySystem({ items, onRemove }: { items: { label: string; code?: string }[]; onRemove: (label: string) => void }) {
  const { tc } = usePreferences()
  if (items.length === 0) return null
  const grouped: Partial<Record<BodySystem, typeof items>> = {}
  for (const item of items) {
    const system = getBodySystem(item.code ?? "")
    if (!grouped[system]) grouped[system] = []
    grouped[system]!.push(item)
  }
  return (
    <View style={{ marginTop: 12, gap: 10 }}>
      {SYSTEM_ORDER.filter(s => grouped[s]).map(system => {
        const col = SYSTEM_HEX[system]
        const tcKey = BODY_SYSTEM_TC[system]
        return (
          <View key={system}>
            <Text style={{ color: col, fontSize: 9, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 6 }}>{tcKey ? tc(tcKey) : system}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {grouped[system]!.map(item => (
                <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: col + "18", borderWidth: 1, borderColor: col + "55" }}>
                  <Text style={{ color: col, fontSize: 12, fontWeight: "700" }} numberOfLines={1}>{item.label}</Text>
                  <Pressable onPress={() => onRemove(item.label)} hitSlop={6}>
                    <Text style={{ color: col, fontSize: 12, fontWeight: "700", opacity: 0.7 }}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )
      })}
    </View>
  )
}

function ScoreBadge({ label, score, max, riskLabel }: { label: string; score: number; max: number; riskLabel?: string }) {
  const color = score <= 1 ? colors.success : score <= 3 ? colors.warning : colors.danger
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: withAlpha(color, "66"), borderRadius: 15, paddingVertical: 12, alignItems: "center" }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900" }}>{label}</Text>
      <Text style={{ color, fontSize: 24, fontWeight: "900", marginTop: 3 }}>{score}<Text style={{ color: colors.textMuted, fontSize: 15 }}>/{max}</Text></Text>
      {!!riskLabel && (
        <Text style={{ color, fontSize: 9, fontWeight: "800", textAlign: "center", marginTop: 4, paddingHorizontal: 4 }} numberOfLines={1}>{riskLabel}</Text>
      )}
    </View>
  )
}

function MetricBadge({ label, value, unit, tone = colors.primary }: { label: string; value: string; unit: string; tone?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: withAlpha(tone, "55"), borderRadius: 15, paddingVertical: 12, alignItems: "center" }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900" }}>{label}</Text>
      <Text style={{ color: tone, fontSize: 22, fontWeight: "900", marginTop: 3, fontVariant: ["tabular-nums"] }}>
        {value}<Text style={{ color: colors.textMuted, fontSize: 12 }}> {unit}</Text>
      </Text>
    </View>
  )
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundToStep(value: number, step: number, precision: number) {
  return Number((Math.round(value / step) * step).toFixed(Math.max(precision, 2)))
}

function formatClinicalValue(value: number | undefined, precision: number) {
  if (value == null) return "-"
  return precision > 0 ? value.toFixed(precision).replace(/\.0+$/, "") : String(Math.round(value))
}

function VitalStepper({ value, onChange, min, max, step = 1, precision = 0, unit, placeholder = "-" }: {
  value?: number
  onChange: (value: number | undefined) => void
  min: number
  max: number
  step?: number
  precision?: number
  unit?: string
  placeholder?: string
}) {
  const [keypadOpen, setKeypadOpen] = useState(false)
  const [keypadText, setKeypadText] = useState("")
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [trackWidth, setTrackWidth] = useState(1)
  const fieldRef = useRef<View>(null)
  const trackXRef = useRef(0)
  const holdTimer = useRef<{ initial: ReturnType<typeof setTimeout> | null; repeat: ReturnType<typeof setInterval> | null }>({ initial: null, repeat: null })
  const { height: screenHeight, width: screenWidth } = useWindowDimensions()

  const commit = useCallback((next: number | undefined) => {
    hapticTick()
    if (next == null) {
      onChange(undefined)
      return
    }
    onChange(clampNumber(roundToStep(next, step, precision), min, max))
  }, [max, min, onChange, precision, step])

  const nudge = useCallback((direction: -1 | 1) => {
    commit((value ?? min) + direction * step)
  }, [commit, min, step, value])

  function startHold(direction: -1 | 1) {
    nudge(direction)
    holdTimer.current.initial = setTimeout(() => {
      holdTimer.current.repeat = setInterval(() => nudge(direction), 120)
    }, 420)
  }

  const stopHold = useCallback(() => {
    if (holdTimer.current.initial) clearTimeout(holdTimer.current.initial)
    if (holdTimer.current.repeat) clearInterval(holdTimer.current.repeat)
    holdTimer.current.initial = null
    holdTimer.current.repeat = null
  }, [])

  useEffect(() => stopHold, [stopHold])

  const setFromPageX = useCallback((pageX: number) => {
    const ratio = clampNumber((pageX - trackXRef.current) / Math.max(1, trackWidth), 0, 1)
    commit(min + ratio * (max - min))
  }, [commit, max, min, trackWidth])

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      setFromPageX(event.nativeEvent.pageX)
    },
    onPanResponderMove: (_, gesture) => {
      setFromPageX(gesture.moveX)
    },
  }), [setFromPageX])

  function openKeypad() {
    setKeypadText(value != null ? formatClinicalValue(value, precision) : "")
    fieldRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height })
      setKeypadOpen(true)
    })
  }

  function closeKeypad() {
    const parsed = Number(keypadText.replace(",", "."))
    if (keypadText.trim() && Number.isFinite(parsed)) commit(parsed)
    setKeypadOpen(false)
  }

  function pressKey(key: string) {
    hapticKey()
    if (key === "clear") {
      setKeypadText("")
      return
    }
    if (key === "back") {
      setKeypadText((current) => current.slice(0, -1))
      return
    }
    setKeypadText((current) => {
      if (key === "." && (precision === 0 || current.includes("."))) return current
      return `${current}${key}`.replace(/^0+(?=\d)/, "")
    })
  }

  const ratio = value == null ? 0 : (clampNumber(value, min, max) - min) / (max - min)

  // Keypad should always be comfortably wide regardless of the field's actual width.
  // When the field is narrow (e.g. SBP/DBP in a 2-column row), the keypad is
  // centred on screen at a fixed width instead of inheriting the tiny field width.
  const KEYPAD_MIN_W = 268
  const keypadWidth = Math.max(KEYPAD_MIN_W, anchor?.width ?? KEYPAD_MIN_W)
  const keypadLeft  = anchor
    ? keypadWidth <= (anchor.width ?? 0)
      ? anchor.x                                              // field is wide enough — align left
      : Math.max(8, Math.min(anchor.x, screenWidth - keypadWidth - 8)) // shift left if it would overflow
    : 8
  const keypadTop = anchor ? Math.max(8, Math.min(anchor.y, screenHeight - 330)) : 0

  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPressIn={() => startHold(-1)}
          onPressOut={stopHold}
          style={{ width: 44, height: 44, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "900" }}>-</Text>
        </Pressable>

        <View ref={fieldRef} collapsable={false} style={{ flex: 1 }}>
          <Pressable onPress={openKeypad} style={{ minHeight: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: colors.borderStrong }}>
            <Text style={{ color: value == null ? colors.textMuted : colors.textPrimary, fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
              {value == null ? placeholder : formatClinicalValue(value, precision)}{unit ? <Text style={{ color: colors.textMuted, fontSize: 13 }}> {unit}</Text> : null}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPressIn={() => startHold(1)}
          onPressOut={stopHold}
          style={{ width: 44, height: 44, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "900" }}>+</Text>
        </Pressable>
      </View>

      <View
        ref={(node) => {
          if (!node) return
          node.measureInWindow((x) => { trackXRef.current = x })
        }}
        onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
        style={{ height: 28, justifyContent: "center" }}
        {...panResponder.panHandlers}
      >
        <View style={{ height: 5, borderRadius: 999, backgroundColor: colors.borderStrong }} />
        <View style={{ position: "absolute", left: `${ratio * 100}%`, width: 10, height: 22, marginLeft: -5, borderRadius: 5, backgroundColor: colors.textSecondary }} />
      </View>

      <Modal visible={keypadOpen && anchor != null} transparent animationType="fade" onRequestClose={closeKeypad}>
        <Pressable onPress={closeKeypad} style={{ flex: 1, backgroundColor: "transparent" }}>
          <Pressable
            onPress={(event) => event.stopPropagation?.()}
            style={{ position: "absolute", left: keypadLeft, top: keypadTop, width: keypadWidth }}
          >
            <View style={{ borderRadius: 18, borderCurve: "continuous", borderWidth: 1, borderColor: withAlpha(colors.primary, "66"), backgroundColor: colors.surface, padding: 8, boxShadow: "0 16px 34px rgba(0,0,0,0.32)" }}>
              <View style={{ minHeight: 54, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: withAlpha(colors.textPrimary, "24"), backgroundColor: withAlpha(colors.textPrimary, "10"), alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Text style={{ color: keypadText ? colors.textPrimary : colors.textMuted, fontSize: 25, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
                  {keypadText || "-"}{unit && keypadText ? <Text style={{ color: colors.textMuted, fontSize: 13 }}> {unit}</Text> : null}
                </Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", precision > 0 ? "." : "clear", "0", "back"].map((key) => (
                  <Pressable key={key} onPress={() => pressKey(key)} style={{ width: "31.5%", minHeight: 48, borderRadius: 14, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ color: colors.textPrimary, fontSize: key.length === 1 ? 21 : 13, fontWeight: "900" }}>
                      {key === "back" ? "Back" : key === "clear" ? "Clear" : key}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

function VitalNumber({ label, unit, value, onChange, unobtainable, onToggleUnobtainable, min, max, step = 1, precision = 0, labelUnableToObtain = "Unable to obtain" }: {
  label: string
  unit: string
  value?: number
  onChange: (value: number | undefined) => void
  unobtainable: boolean
  onToggleUnobtainable: () => void
  min: number
  max: number
  step?: number
  precision?: number
  labelUnableToObtain?: string
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "900" }}>{label}</Text>
        <Pressable
          onPress={() => { impact(); onToggleUnobtainable() }}
          style={{
            borderRadius: 999,
            borderWidth: 1,
            borderColor: unobtainable ? colors.warning : colors.border,
            backgroundColor: unobtainable ? withAlpha(colors.warning, "18") : colors.surface,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: unobtainable ? colors.warning : colors.textMuted, fontSize: 11, fontWeight: "900" }}>{labelUnableToObtain}</Text>
        </Pressable>
      </View>
      {unobtainable ? (
        <View style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: "center", paddingHorizontal: 12 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "800" }}>Not available</Text>
        </View>
      ) : (
        <VitalStepper value={value} onChange={(next) => { impact(); onChange(next) }} min={min} max={max} step={step} precision={precision} unit={unit} placeholder={label} />
      )}
    </View>
  )
}

function ManualLabPanel({ value, onChange, labelManualLabEntry = "Manual lab entry", labelHideManualLab = "Hide manual lab entry", labelSearchLabs = "Search tests..." }: { value: { test: string; value: string; unit: string }[]; onChange: (value: { test: string; value: string; unit: string }[]) => void; labelManualLabEntry?: string; labelHideManualLab?: string; labelSearchLabs?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const filtered = useMemo(() => query.length >= 2 ? searchLabs(query) : null, [query])

  function addTest(test: LabTest) {
    if (value.some((row) => row.test === test.name)) return
    onChange([...value, { test: test.name, value: "", unit: test.unit }])
    setQuery("")
  }

  function update(test: string, nextValue: string) {
    onChange(value.map((row) => row.test === test ? { ...row, value: nextValue } : row))
  }

  return (
    <View>
      {value.length > 0 ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 12 }}>
          {value.map((row, idx) => {
            const testDef = searchLabs(row.test)[0]?.test
            const numeric = Number.parseFloat(row.value)
            const flag = testDef && Number.isFinite(numeric) ? getLabOutOfRange(testDef, numeric) : null
            return (
              <View key={row.test} style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: idx < value.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12, fontWeight: "900" }} numberOfLines={1}>{row.test}</Text>
                <TextInput
                  value={row.value}
                  onChangeText={(text) => update(row.test, text)}
                  keyboardType="decimal-pad"
                  placeholder="-"
                  placeholderTextColor={colors.textMuted}
                  style={{ width: 72, color: flag ? colors.warning : colors.textPrimary, backgroundColor: colors.background, borderWidth: 1, borderColor: flag ? colors.warning : colors.border, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, textAlign: "right", fontWeight: "900" }}
                />
                <Text style={{ width: 48, color: colors.textMuted, fontSize: 11 }}>{row.unit}</Text>
                <Pressable onPress={() => onChange(value.filter((item) => item.test !== row.test))}>
                  <Text style={{ color: colors.danger, fontSize: 16, fontWeight: "900" }}>x</Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      ) : null}

      <Pressable onPress={() => setExpanded(!expanded)} style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, marginBottom: expanded ? 12 : 0 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "900" }}>{expanded ? labelHideManualLab : labelManualLabEntry}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Typing is the backup path. Camera and Gallery are primary.</Text>
      </Pressable>

      {expanded ? (
        <View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={labelSearchLabs}
            placeholderTextColor={colors.textMuted}
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, color: colors.textPrimary, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 }}
          />
          {filtered ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
              {filtered.slice(0, 8).map((result, idx) => (
                <Pressable key={result.test.name} onPress={() => addTest(result.test)} style={{ padding: 12, borderBottomWidth: idx < Math.min(filtered.length, 8) - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "900" }}>{result.test.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{result.category.label} - {result.test.unit}</Text>
                </Pressable>
              ))}
            </View>
          ) : LAB_CATEGORIES.map((cat) => (
            <View key={cat.id} style={{ marginBottom: 8 }}>
              <Pressable onPress={() => setCategory(category === cat.id ? null : cat.id)} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 }}>
                <Text style={{ color: colors.textSecondary, fontWeight: "900" }}>{cat.label}</Text>
              </Pressable>
              {category === cat.id ? cat.tests.map((test) => (
                <Pressable key={test.name} onPress={() => addTest(test)} style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Text style={{ color: colors.textMuted, fontWeight: "800" }}>{test.name} ({test.unit})</Text>
                </Pressable>
              )) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

// Map server preop data back into the new-case form fields

// For comma-separated fields (allergyDetails, currentMedications)
function commaToTags(value: unknown): { label: string; code?: string; inn?: string; atcCode?: string }[] {
  if (Array.isArray(value)) return value
  if (typeof value !== "string" || !value.trim()) return []
  const trimmed = value.trim()
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed
    } catch {}
  }
  return value.split(",").map(s => s.trim()).filter(Boolean).map(label => ({ label }))
}

// For diagnoses/procedures: DB stores as diagnosesJson/proceduresJson (array) or
// as a legacy "; "-joined string. Never split on commas — names contain them.
function diagToTags(value: unknown): { label: string; code?: string; sub?: string }[] {
  if (Array.isArray(value)) return value
  if (typeof value !== "string" || !value.trim()) return []
  return value.split(";").map(s => s.trim()).filter(Boolean).map(label => ({ label }))
}

type ServerPreop = Partial<FormInput> & {
  diagnosesJson?: unknown
  diagnosis?: unknown
  proceduresJson?: unknown
  plannedProcedure?: unknown
  comorbidities?: unknown
  ulbt?: unknown
  age?: number
  weight?: number
  height?: number
  difficultAirway?: boolean
  updatedAt?: string
}

function valuesFromServerPreop(p: ServerPreop): Partial<FormInput> {
  const ulbt = p.upperLipBiteTest ?? p.ulbt
  const toClass = (v: unknown) =>
    v === "CLASS_I" || v === "CLASS_II" || v === "CLASS_III" ? v as "CLASS_I" | "CLASS_II" | "CLASS_III"
    : v === "I" ? "CLASS_I" : v === "II" ? "CLASS_II" : v === "III" ? "CLASS_III" : undefined
  return {
    ageYears:            p.ageYears ?? undefined,
    sex:                 p.sex ?? "MALE",
    heightCm:            p.heightCm ?? undefined,
    weightKg:            p.weightKg ?? undefined,
    bloodType:           p.bloodType ?? undefined,
    rhFactor:            p.rhFactor ?? undefined,
    diagnoses:           diagToTags(p.diagnosesJson ?? p.diagnosis),
    procedures:          diagToTags(p.proceduresJson ?? p.plannedProcedure),
    highRiskSurgery:     p.highRiskSurgery ?? false,
    elective:            p.elective ?? !p.emergencySurgery,
    emergencySurgery:    p.emergencySurgery ?? false,
    comorbidities:       diagToTags(p.comorbidities),
    currentMedications:  commaToTags(p.currentMedications),
    allergies:           p.allergies ?? false,
    latexAllergy:        p.latexAllergy ?? false,
    allergyDetails:      commaToTags(p.allergyDetails),
    familyAnesthesiaProblems: p.familyAnesthesiaProblems ?? false,
    familyAnesthesiaDetails:  p.familyAnesthesiaDetails ?? undefined,
    dentalProsthetics:   p.dentalProsthetics ?? false,
    looseTeeth:          p.looseTeeth ?? false,
    smoking:             p.smoking ?? false,
    substanceAbuse:      p.substanceAbuse ?? false,
    bpSystolic:          p.bpSystolic ?? undefined,
    bpDiastolic:         p.bpDiastolic ?? undefined,
    heartRate:           p.heartRate ?? undefined,
    heartArrhythmia:     p.heartArrhythmia ?? false,
    spO2:                p.spO2 ?? undefined,
    temperature:         p.temperature ?? undefined,
    respiratoryRate:     p.respiratoryRate ?? undefined,
    bpUnobtainable:      p.bpUnobtainable ?? false,
    heartRateUnobtainable: p.heartRateUnobtainable ?? false,
    spO2Unobtainable:    p.spO2Unobtainable ?? false,
    temperatureUnobtainable: p.temperatureUnobtainable ?? false,
    respiratoryRateUnobtainable: p.respiratoryRateUnobtainable ?? false,
    physicalExamReport:  p.physicalExamReport ?? undefined,
    mallampati:          p.mallampati ?? undefined,
    mouthOpeningCm:      p.mouthOpeningCm ?? undefined,
    thyromental:         p.thyromental ?? undefined,
    neckMobility:        p.neckMobility ?? undefined,
    upperLipBiteTest:    toClass(ulbt),
    cormackLehane:       p.cormackLehane ?? undefined,
    retrognathia:        p.retrognathia ?? false,
    prominentIncisors:   p.prominentIncisors ?? false,
    facialHair:          p.facialHair ?? false,
    difficultAirwayHistory: p.difficultAirwayHistory ?? p.difficultAirway ?? false,
    difficultAirwayNotes: p.difficultAirwayNotes ?? undefined,
    airwayUnobtainable:  p.airwayUnobtainable ?? false,
    rcriIschemicHeart:   p.rcriIschemicHeart ?? false,
    rcriCHF:             p.rcriCHF ?? false,
    rcriCVD:             p.rcriCVD ?? false,
    rcriInsulinDM:       p.rcriInsulinDM ?? false,
    rcriCreatinine:      p.rcriCreatinine ?? false,
    apfelPONVHistory:    p.apfelPONVHistory ?? false,
    apfelPostopOpioids:  p.apfelPostopOpioids ?? false,
    stopbangSnoring:     p.stopbangSnoring ?? false,
    stopbangTired:       p.stopbangTired ?? false,
    stopbangObserved:    p.stopbangObserved ?? false,
    stopbangBP:    p.stopbangBP ?? false,
    stopbangNeck:        p.stopbangNeck ?? false,
    asaScore:            p.asaScore ?? "I",
    teamNotes:           p.teamNotes ?? p.notes ?? undefined,
    notes:               p.notes ?? undefined,
    aiOptIn:        p.aiOptIn ?? false,
    labResults:          Array.isArray(p.labResults) ? p.labResults : [],
  }
}

export default function NewCaseScreen() {
  const router = useRouter()
  const { continue: continueId, localId: localIdParam } = useLocalSearchParams<{ continue?: string; localId?: string }>()
  const insets = useSafeAreaInsets()
  const { preopLayout, tc, language, heightUnit, weightUnit, temperatureUnit, etco2Unit } = usePreferences()
  const unitPrefs = { heightUnit, weightUnit, temperatureUnit, etco2Unit }

  const ageRange         = useRangeSpec("AGE_RANGE")
  const heightRange      = useRangeSpec("HEIGHT_RANGE")
  const weightRange      = useRangeSpec("WEIGHT_RANGE")
  const bpSystolicRange  = useRangeSpec("BP_SYSTOLIC_RANGE")
  const bpDiastolicRange = useRangeSpec("BP_DIASTOLIC_RANGE")
  const heartRateRange   = useRangeSpec("HEART_RATE_RANGE")
  const spo2Range        = useRangeSpec("SPO2_RANGE")
  const temperatureRange = useRangeSpec("TEMPERATURE_RANGE")
  const respiratoryRange = useRangeSpec("RESPIRATORY_RATE_RANGE")
  const mouthOpeningRange= useRangeSpec("MOUTH_OPENING_RANGE")
  const thyromentalRange = useRangeSpec("THYROMENTAL_RANGE")
  const { options: mallampatiOptions }    = useOptionLibrary("MALLAMPATI")
  const { options: neckMobilityOptions }  = useOptionLibrary("NECK_MOBILITY")
  const { options: upperLipBiteOptions }  = useOptionLibrary("UPPER_LIP_BITE")
  const { options: cormackLehaneOptions } = useOptionLibrary("CORMACK_LEHANE")
  const lbl = (opt: { label: string; labelBg: string | null }) => (language === "bg" && opt.labelBg) ? opt.labelBg : opt.label

  // Build translated section labels from tc() — must be inside component
  // Pill rail labels (shorter) vs full section card titles
  const SECTION_LABELS: { key: PreopSection; label: string }[] = useMemo(() => [
    { key: "patient",   label: tc("pillPatient") },
    { key: "case",      label: tc("sectionCaseDetails") },
    { key: "history",   label: tc("sectionHistory") },
    { key: "meds",      label: tc("sectionMeds") },
    { key: "anamnesis", label: tc("pillAnamnesis") },
    { key: "exam",      label: tc("sectionExam") },
    { key: "airway",    label: tc("pillAirway") },
    { key: "labs",      label: tc("pillLabs") },
    { key: "risk",      label: tc("pillRisk") },
  ], [tc])
  const { width: screenWidth } = useWindowDimensions()
  const primaryHeaderHeight = insets.top + 60
  const scrollRef = useRef<ScrollView>(null)
  const sectionRailRef = useRef<ScrollView>(null)
  const pillLayouts = useRef<Partial<Record<PreopSection, { x: number; width: number }>>>({})
  const sectionY = useRef<Partial<Record<PreopSection, number>>>({})
  const lastScrollY = useRef(0)

  function scrollToSection(section: PreopSection, extraOffset = 0) {
    const y = (sectionY.current[section] ?? 0) + extraOffset
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true })
  }
  const activeSectionRef = useRef<PreopSection>("patient")
  const slideAnim = useRef(new Animated.Value(0)).current
  const gestureScale = useRef(new Animated.Value(1)).current
  const slideDir = useRef<1 | -1>(1)
  const headerAnim = useRef(new Animated.Value(0)).current
  const headerCollapseRef = useRef(0)
  const scrollYAnim = useRef(new Animated.Value(0)).current
  const scrollRailVisibleRef = useRef(false)
  const maxScrollYRef = useRef(1)
  const isScrollingRef = useRef(false)
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiText, setAiText] = useState("")
  const [aiError, setAiError] = useState("")
  const [activeSection, setActiveSection] = useState<PreopSection>("patient")
  const [preopMode, setPreopMode] = useState<"overview" | "editing">("overview")
  const preopModeRef = useRef<"overview" | "editing">("overview")

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (preopModeRef.current === "editing") {
          setPreopMode("overview")
          preopModeRef.current = "overview"
          return true // consumed — don't bubble to navigator
        }
        return false // let the navigator handle it (goes to dashboard)
      })
      return () => sub.remove()
    }, [])
  )

  const [scrollRailVisible, setScrollRailVisible] = useState(false)
  const [appHeaderHidden, setAppHeaderHidden] = useState(false)
  const [railHeight, setRailHeight] = useState(1)
  const [maxScrollY, setMaxScrollY] = useState(1)
  const scrollRailTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "queued">("idle")
  const [saveError, setSaveError] = useState<string | null>(null)
  const localIdRef = useRef<string | null>(localIdParam ?? null)
  const autosaveDraftRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveInFlightRef = useRef<Promise<void> | null>(null)
  const submittingRef = useRef(false)
  const caseIdRef = useRef<string | null>(null)
  const [,       setCaseId]       = useState<string | null>(null)
  const [preopFinalizedAt, setPreopFinalizedAt] = useState<string | null>(null)
  const [preopCaseStatus,  setPreopCaseStatus]  = useState<string | null>(null)
  const basePreopUpdatedAtRef = useRef<string | null>(null)

  const { control, handleSubmit, setValue, getValues, reset, formState: { errors } } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      sex: "MALE",
      asaScore: "I",
      elective: true,
      emergencySurgery: false,
      highRiskSurgery: false,
      diagnoses: [],
      procedures: [],
      comorbidities: [],
      currentMedications: [],
      allergyDetails: [],
      labResults: [],
      bpSystolic:  Math.floor(Math.random() * 11) + 120,
      bpDiastolic: Math.floor(Math.random() * 16) + 70,
      heartRate:   Math.floor(Math.random() * 31) + 60,
      spO2:        Math.floor(Math.random() * 5)  + 95,
      temperature: parseFloat((36 + Math.random()).toFixed(1)),
    },
  })

  // Batched watch subscriptions — 4 groups instead of 17 individual calls
  const [sex, smoking, ageYears, heightCm, weightKg, bloodType, rhFactor,
         allergies, familyAnesthesiaProblems, airwayUnobtainable, difficultAirwayHistory,
         labResults, _aiOptIn, highRiskSurgery, emergencySurgery, comorbidities, currentMedications] =
    useWatch({ control, name: ["sex", "smoking", "ageYears", "heightCm", "weightKg", "bloodType", "rhFactor",
               "allergies", "familyAnesthesiaProblems", "airwayUnobtainable", "difficultAirwayHistory",
               "labResults", "aiOptIn", "highRiskSurgery", "emergencySurgery", "comorbidities", "currentMedications"] })

  const rcriInputs = useWatch({ control, name: ["rcriIschemicHeart", "rcriCHF", "rcriCVD", "rcriInsulinDM", "rcriCreatinine"] })
  const stopbangInputs = useWatch({ control, name: ["stopbangSnoring", "stopbangTired", "stopbangObserved", "stopbangBP", "stopbangNeck"] })
  const [apfelPONVHistory, apfelPostopOpioids] = useWatch({ control, name: ["apfelPONVHistory", "apfelPostopOpioids"] })

  const bmi = heightCm && weightKg ? weightKg / ((heightCm / 100) ** 2) : null

  // Suggestions only — never silently auto-checked, same rule as the ASA suggestion.
  const rcriSuggested = {
    rcriIschemicHeart: suggestRcriIschemicHeart(comorbidities ?? []),
    rcriCHF:            suggestRcriCHF(comorbidities ?? []),
    rcriCVD:            suggestRcriCVD(comorbidities ?? []),
    rcriInsulinDM:      suggestRcriInsulinDM(comorbidities ?? [], currentMedications ?? []),
    rcriCreatinine:     suggestRcriCreatinine(labResults ?? []),
  }
  const stopBangBPSuggested = suggestStopBangBP(comorbidities ?? [], currentMedications ?? [])
  const RCRI_HINT = "Suggested by comorbidities/medications — review and confirm"
  const asaSuggestion = suggestASAFromTags(comorbidities ?? [], bmi)
  const ibw = heightCm ? (sex === "MALE" ? 50 : 45.5) + 2.3 * ((heightCm / 2.54) - 60) : null
  const abw = ibw && weightKg && weightKg > ibw ? ibw + 0.4 * (weightKg - ibw) : null
  const rcriScore = [highRiskSurgery, ...rcriInputs].filter(Boolean).length
  const apfelScore = [sex === "FEMALE", !smoking, apfelPONVHistory, apfelPostopOpioids].filter(Boolean).length
  const stopBangScore = [
    stopbangInputs[0],
    stopbangInputs[1],
    stopbangInputs[2],
    stopbangInputs[3],
    bmi != null && bmi > 35,
    ageYears != null && ageYears > 50,
    stopbangInputs[4],
    sex === "MALE",
  ].filter(Boolean).length

  useEffect(() => {
    if (!allergies && (getValues("allergyDetails")?.length ?? 0) > 0) {
      setValue("allergyDetails", [], { shouldDirty: true })
    }
    if (!familyAnesthesiaProblems && getValues("familyAnesthesiaDetails")) {
      setValue("familyAnesthesiaDetails", "", { shouldDirty: true })
    }
  }, [allergies, familyAnesthesiaProblems, getValues, setValue])

  const SECTION_KEYS = useMemo(() => SECTION_LABELS.map(s => s.key), [SECTION_LABELS])
  const activeIndex = SECTION_KEYS.indexOf(activeSection)
  function showSection(section: PreopSection): boolean {
    return preopLayout !== "sections" || activeSection === section
  }

  const goNextSection = useCallback(() => {
    if (activeIndex < SECTION_KEYS.length - 1) {
      impact()
      slideDir.current = 1
      setActiveSection(SECTION_KEYS[activeIndex + 1])
    }
  }, [SECTION_KEYS, activeIndex])

  const goPrevSection = useCallback(() => {
    if (activeIndex > 0) {
      impact()
      slideDir.current = -1
      setActiveSection(SECTION_KEYS[activeIndex - 1])
    }
  }, [SECTION_KEYS, activeIndex])

  const sectionSwipeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      preopLayout === "sections" && Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 20,
    onPanResponderRelease: (_, { dx }) => {
      if (dx < -50) goNextSection()
      else if (dx > 50) goPrevSection()
    },
   
  }), [goNextSection, goPrevSection, preopLayout])

  useEffect(() => {
    return () => {
      if (scrollRailTimer.current) clearTimeout(scrollRailTimer.current)
      if (autosaveDraftRef.current) clearTimeout(autosaveDraftRef.current)
    }
  }, [])

  // Helper: build the canonical preop payload from current form values
  // buildPreopPayload is imported from @/lib/preop-payload (shared with the offline flusher)

  // Attempt to create the case on the server with current form values.
  // Returns the new caseId on success, null on failure.
  const clearLocalDraft = useCallback(async () => {
    if (localIdRef.current) {
      await deleteLocalCaseDraft(localIdRef.current)
      localIdRef.current = null
    }
  }, [])

  const tryCreateServerCase = useCallback(async (values: FormInput): Promise<string | null> => {
    const payload = buildPreopPayload(values)
    // Guard: skip only if values object is completely empty (e.g. form not yet mounted).
    // "sex" always defaults to "MALE" so any real form state passes this check.
    if (!values || Object.keys(values).length === 0) return null
    try {
      const res = await apiFetch("/api/cases", {
        method: "POST",
        body: JSON.stringify({ preop: payload }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        const msg = `HTTP ${res.status}: ${errBody.error ?? "server error"}`
        console.error("[LOSPOR] POST /api/cases failed", res.status, errBody)
        setSaveError(msg)
        return null
      }
      setSaveError(null)
      const json = await res.json()
      const id: string = json.id
      const updatedAt: string | undefined = json.preopUpdatedAt ?? json.preop?.updatedAt ?? json.updatedAt
      caseIdRef.current = id
      setCaseId(id)
      void clearLocalDraft()
      basePreopUpdatedAtRef.current = updatedAt ?? null
      return id
    } catch (err) {
      const msg = `Network error: ${err instanceof Error ? err.message : "cannot reach server"}`
      console.error("[LOSPOR] POST /api/cases network error", err)
      setSaveError(msg)
      return null
    }
  }, [clearLocalDraft])

  const persistLocalDraft = useCallback(async (values: FormInput): Promise<boolean> => {
    if (!localIdRef.current) localIdRef.current = makeLocalCaseId()
    const ok = await saveLocalCaseDraft(localIdRef.current, values)
    if (!ok) {
      // Storage write failed — tell the user the draft is NOT saved
      setSaveError("Storage error — draft could not be saved locally")
    }
    return ok
  }, [])

  // Load existing case when ?continue=<id> is in the URL
  useEffect(() => {
    if (!continueId) return
    caseIdRef.current = continueId
    setCaseId(continueId)
    apiJson<{ preop?: ServerPreop; finalizedAt?: string | null; status?: string }>(`/api/cases/${continueId}`)
      .then((caseData) => {
        const p = caseData.preop ?? {}
        basePreopUpdatedAtRef.current = p.updatedAt ?? null
        reset(valuesFromServerPreop(p) as FormInput)
        setPreopFinalizedAt(caseData.finalizedAt ?? null)
        setPreopCaseStatus(caseData.status ?? null)
        void clearLocalDraft()
      })
      .catch(async (err: Error) => {
        if (err instanceof ApiError && err.status === 404) {
          caseIdRef.current = null
          setCaseId(null)
          basePreopUpdatedAtRef.current = null
          Alert.alert(tc("errorLabel"), "This draft no longer exists. Returning to the dashboard.")
          router.replace("/(app)")
          return
        }
        Alert.alert(tc("errorLabel"), err.message ?? "Could not load case.")
      })
   
  }, [clearLocalDraft, continueId, reset, router, tc])

  // Restore local draft silently when opened from the dashboard via ?localId=
  useEffect(() => {
    if (continueId || !localIdParam) return
    loadLocalCaseDraft(localIdParam).then(draft => {
      if (!draft) return
      reset(draft.formValues as FormInput)
      setDraftState("queued")
    })
   
  }, [continueId, localIdParam, reset])

  // useWatch triggers a React re-render on every field change — works on both native and web.
  // (watch(callback) subscription doesn't fire reliably on Expo web builds.)
  const _allFormValues = useWatch({ control })

  // Autosave on every form change (2s debounce): server-first, local fallback
  useEffect(() => {
    if (submittingRef.current) return
    setDraftState("saving")
    if (autosaveDraftRef.current) clearTimeout(autosaveDraftRef.current)
    autosaveDraftRef.current = setTimeout(() => {
      const values = getValues()
      const task = (async () => {
        try {
          if (!caseIdRef.current) {
            // First save: try to create the case on the server
            const id = await tryCreateServerCase(values)
            if (id) {
              await clearLocalDraft()
              setDraftState("saved")
              return
            }
            // Offline or error: save locally so the case appears on the dashboard
            await persistLocalDraft(values)
            setDraftState("queued")
            return
          }
          // Subsequent saves: patch the existing server case
          const result = await saveCasePatchWithQueue(
            caseIdRef.current, "preop", buildPreopPayload(values), basePreopUpdatedAtRef.current
          )
          if (result.result === "saved") {
            basePreopUpdatedAtRef.current = result.response?.preopUpdatedAt ?? basePreopUpdatedAtRef.current
            await clearLocalDraft()
            setDraftState("saved")
          } else if (result.result === "queued") {
            setSaveError("Network error — patch queued")
            await persistLocalDraft(values)
            setDraftState("queued")
          } else {
            setDraftState("idle")
          }
        } catch (error) {
          if (error instanceof ApiError && error.status === 404 && caseIdRef.current) {
            caseIdRef.current = null
            setCaseId(null)
            basePreopUpdatedAtRef.current = null
            const replacementId = await tryCreateServerCase(values)
            if (replacementId) {
              await clearLocalDraft()
              setDraftState("saved")
              return
            }
          }
          await persistLocalDraft(values).catch(() => {})
          setDraftState("queued")
        }
      })()
      autosaveInFlightRef.current = task
      void task.finally(() => {
        if (autosaveInFlightRef.current === task) autosaveInFlightRef.current = null
      })
    }, 2000)
   
  }, [_allFormValues, clearLocalDraft, getValues, persistLocalDraft, tryCreateServerCase])

  useEffect(() => {
    activeSectionRef.current = activeSection
    const layout = pillLayouts.current[activeSection]
    if (layout) {
      const scrollX = Math.max(0, layout.x + layout.width / 2 - screenWidth / 2)
      sectionRailRef.current?.scrollTo({ x: scrollX, animated: !isScrollingRef.current })
    } else {
      const index = SECTION_LABELS.findIndex((s) => s.key === activeSection)
      if (index >= 0) {
        sectionRailRef.current?.scrollTo({ x: Math.max(0, index * 118 - screenWidth / 2 + 59), animated: !isScrollingRef.current })
      }
    }
  }, [SECTION_LABELS, activeSection, screenWidth])

  const runSectionEnterAnim = useCallback((fromDir: 1 | -1) => {
    slideAnim.setValue(fromDir * screenWidth * 0.35)
    gestureScale.setValue(0.93)
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(gestureScale, { toValue: 1, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start()
  }, [gestureScale, screenWidth, slideAnim])

  useEffect(() => {
    if (preopLayout !== "sections") return
    runSectionEnterAnim(slideDir.current)
   
  }, [activeSection, preopLayout, runSectionEnterAnim])

  const sectionPan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) =>
      Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.4,
    onPanResponderGrant: () => {
      slideAnim.stopAnimation()
      gestureScale.stopAnimation()
    },
    onPanResponderMove: (_, gs) => {
      const curIdx = SECTION_KEYS.indexOf(activeSectionRef.current)
      const canLeft  = curIdx < SECTION_KEYS.length - 1
      const canRight = curIdx > 0
      if ((gs.dx < 0 && canLeft) || (gs.dx > 0 && canRight)) {
        slideAnim.setValue(gs.dx)
        gestureScale.setValue(1 - 0.07 * Math.min(1, Math.abs(gs.dx) / screenWidth))
      }
    },
    onPanResponderRelease: (_, gs) => {
      const threshold = screenWidth * 0.26
      const curIdx  = SECTION_KEYS.indexOf(activeSectionRef.current)
      const canLeft  = curIdx < SECTION_KEYS.length - 1
      const canRight = curIdx > 0
      const goLeft  = gs.dx < 0 && (Math.abs(gs.dx) > threshold || gs.vx < -0.5) && canLeft
      const goRight = gs.dx > 0 && (Math.abs(gs.dx) > threshold || gs.vx >  0.5) && canRight
      if (goLeft || goRight) {
        const dir = goLeft ? -1 : 1
        const target = SECTION_KEYS[curIdx - dir] as PreopSection
        Animated.parallel([
          Animated.timing(slideAnim,    { toValue: dir * screenWidth * 0.6, duration: 150, useNativeDriver: true, easing: Easing.in(Easing.cubic) }),
          Animated.timing(gestureScale, { toValue: 0.93, duration: 150, useNativeDriver: true }),
        ]).start(() => {
          slideDir.current = -dir as 1 | -1
          setActiveSection(target)
          preopModeRef.current = "editing"
          setPreopMode("editing")
        })
      } else {
        Animated.parallel([
          Animated.spring(slideAnim,    { toValue: 0, useNativeDriver: true, tension: 200, friction: 26 }),
          Animated.spring(gestureScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 26 }),
        ]).start()
      }
    },
    onPanResponderTerminate: () => {
      Animated.parallel([
        Animated.spring(slideAnim,    { toValue: 0, useNativeDriver: true, tension: 200, friction: 26 }),
        Animated.spring(gestureScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 26 }),
      ]).start()
    },
  })).current

  function jumpTo(section: PreopSection) {
    impact()
    const currentIndex = SECTION_KEYS.indexOf(activeSectionRef.current)
    const targetIndex = SECTION_KEYS.indexOf(section)
    const dir = targetIndex > currentIndex ? -1 : 1
    if (preopLayout === "sections") {
      if (preopModeRef.current !== "editing") {
        // Entering editing from overview — skip exit animation, slide in cleanly from right
        slideDir.current = 1
        activeSectionRef.current = section
        setActiveSection(section)
        preopModeRef.current = "editing"
        slideAnim.setValue(screenWidth * 0.35)
        gestureScale.setValue(0.93)
        setPreopMode("editing")
        Animated.parallel([
          Animated.timing(slideAnim,    { toValue: 0, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
          Animated.timing(gestureScale, { toValue: 1, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        ]).start()
        return
      }
      Animated.parallel([
        Animated.timing(slideAnim,    { toValue: -dir * screenWidth * 0.4, duration: 140, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
        Animated.timing(gestureScale, { toValue: 0.93, duration: 140, useNativeDriver: true }),
      ]).start(() => {
        slideDir.current = dir as 1 | -1
        setActiveSection(section)
        preopModeRef.current = "editing"
        setPreopMode("editing")
      })
    } else {
      setActiveSection(section)
      preopModeRef.current = "editing"
      setPreopMode("editing")
      setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (sectionY.current[section] ?? 0) - 8), animated: true }), 50)
    }
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    isScrollingRef.current = true
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
    scrollEndTimerRef.current = setTimeout(() => { isScrollingRef.current = false }, 350)

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const y = contentOffset.y
    const maxY = Math.max(1, contentSize.height - layoutMeasurement.height)
    if (Math.abs(maxY - maxScrollYRef.current) > 32) {
      maxScrollYRef.current = maxY
      setMaxScrollY(maxY)
    }
    const delta = y - lastScrollY.current
    lastScrollY.current = y

    const collapseDeadZone = 58
    const collapseDistance = 172
    if (y <= 4) {
      headerCollapseRef.current = 0
    } else if (y > collapseDeadZone) {
      const smoothDelta = Math.max(-48, Math.min(48, delta))
      headerCollapseRef.current = Math.min(1, Math.max(0, headerCollapseRef.current + smoothDelta / collapseDistance))
    }
    headerAnim.setValue(headerCollapseRef.current)
    const hidden = headerCollapseRef.current > 0.92
    if (hidden !== appHeaderHidden) setAppHeaderHidden(hidden)

    if (!scrollRailVisibleRef.current) {
      scrollRailVisibleRef.current = true
      setScrollRailVisible(true)
    }
    if (scrollRailTimer.current) clearTimeout(scrollRailTimer.current)
    scrollRailTimer.current = setTimeout(() => {
      scrollRailVisibleRef.current = false
      setScrollRailVisible(false)
    }, 650)

    if (preopLayout !== "sections") {
      const probeY = y + 40
      let current = SECTION_LABELS[0].key
      for (const section of SECTION_LABELS) {
        const sectionTop = sectionY.current[section.key]
        if (sectionTop != null && sectionTop <= probeY) current = section.key
      }
      if (current !== activeSectionRef.current) {
        activeSectionRef.current = current
        setActiveSection(current)
      }
    }
  }

  async function runAdvisor() {
    setAiLoading(true)
    setAiText("")
    setAiError("")
    try {
      const res = await apiFetch("/api/ai/advise", {
        method: "POST",
        body: JSON.stringify({
          ...getValues(),
          bmi,
          rcriScore,
          apfelScore,
          stopBangScore,
          aiOptIn: true,
        }),
      })
      if (!res.ok) {
        if (res.status === 429) throw new Error(tc("aiRateLimit"))
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? tc("aiRequestFailed"))
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response stream available.")

      const decoder = new TextDecoder()
      let text = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setAiText(text)
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : tc("aiRequestFailed"))
    } finally {
      setAiLoading(false)
    }
  }

  async function onSubmit(data: FormData) {
    // Validate mandatory clinical fields before allowing intraop transition.
    // These match the web app's validate() requirements in PreopForm.tsx.
    const missingFields: string[] = []
    if (!data.ageYears && data.ageYears !== 0) missingFields.push("Age")
    if (!data.sex) missingFields.push("Sex")
    if (!data.procedures?.length) missingFields.push("Planned procedure")
    if (!data.diagnoses?.length)  missingFields.push("Diagnosis")
    if (!data.asaScore)           missingFields.push("ASA class")
    if (!data.mallampati && !data.airwayUnobtainable) missingFields.push("Airway (Mallampati)")
    if (missingFields.length > 0) {
      Alert.alert(
        tc("requiredFieldsMissing"),
        `${tc("completeBeforeProceeding")}\n\n• ${missingFields.join("\n• ")}`,
      )
      return
    }

    submittingRef.current = true
    if (autosaveDraftRef.current) {
      clearTimeout(autosaveDraftRef.current)
      autosaveDraftRef.current = null
    }
    setSaving(true)
    try {
      await autosaveInFlightRef.current
      const h = data.heightCm, w = data.weightKg
      const calculatedBmi = h && w ? Number((w / ((h / 100) ** 2)).toFixed(1)) : undefined
      const preopPayload = {
        ...data,
        bmi: calculatedBmi,
        diagnosis: data.diagnoses.map((item) => item.label).join("; "),
        plannedProcedure: data.procedures.map((item) => item.label).join("; "),
        upperLipBiteTest: data.upperLipBiteTest,
        rcriScore,
        apfelScore,
        stopBangScore,
      }
      let id: string
      if (caseIdRef.current) {
        // Case already created by autosave; do a final PATCH with complete data
        const res = await apiFetch(`/api/cases/${caseIdRef.current}`, {
          method: "PATCH",
          headers: basePreopUpdatedAtRef.current
            ? { "x-lospor-preop-updated-at": basePreopUpdatedAtRef.current }
            : undefined,
          body: JSON.stringify({ preop: preopPayload }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          if (res.status === 404) {
            caseIdRef.current = null
            setCaseId(null)
            basePreopUpdatedAtRef.current = null
            const replacementId = await tryCreateServerCase(data)
            if (replacementId) {
              id = replacementId
              await clearLocalDraft()
              router.replace(`/(app)/cases/intraop/${id}`)
              return
            }
          }
          throw new Error(body.error ?? "Save failed")
        }
        id = caseIdRef.current
      } else {
        // No server case yet (offline during autosave); create it now
        const res = await apiFetch("/api/cases", {
          method: "POST",
          body: JSON.stringify({ preop: preopPayload }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? "Save failed")
        }
        const json = await res.json()
        id = json.id
      }
      await clearLocalDraft()
      router.replace(`/(app)/cases/intraop/${id}`)
    } catch (error) {
      Alert.alert(tc("errorLabel"), error instanceof Error ? error.message : "Could not create case.")
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  function computeSectionItems() {
    const v = getValues()
    const hasBP = v.bpSystolic != null || !!v.bpUnobtainable
    const hasHR = v.heartRate != null || !!v.heartRateUnobtainable
    const hasSpO2 = v.spO2 != null || !!v.spO2Unobtainable
    return SECTION_LABELS.map(({ key, label }) => {
      let done = false
      let required = false
      let summary = ""
      switch (key) {
        case "patient":
          required = true
          done = v.ageYears != null
          summary = v.ageYears != null ? `${v.ageYears}y · ${v.sex ?? "-"} · ${v.weightKg ?? "-"}kg` : tc("overviewPatientHint")
          break
        case "case":
          done = (v.diagnoses?.length ?? 0) > 0 || (v.procedures?.length ?? 0) > 0
          summary = v.procedures?.[0]?.label ?? v.diagnoses?.[0]?.label ?? "Diagnosis and procedure"
          break
        case "history":
          done = (v.comorbidities?.length ?? 0) > 0
          summary = done ? `${v.comorbidities?.length} comorbidities` : tc("overviewComorbidities")
          break
        case "meds":
          done = (v.currentMedications?.length ?? 0) > 0
          summary = done ? `${v.currentMedications?.length} medications` : tc("overviewMeds")
          break
        case "anamnesis":
          done = !!(v.allergies || v.familyAnesthesiaProblems || v.smoking || v.substanceAbuse || v.dentalProsthetics || v.looseTeeth)
          summary = [v.allergies && "Allergy", v.smoking && "Smoker", v.familyAnesthesiaProblems && "Family hx"].filter(Boolean).join(" · ") || tc("overviewFlags")
          break
        case "exam":
          required = true
          done = hasBP && hasHR && hasSpO2
          summary = v.bpSystolic != null ? `BP ${v.bpSystolic}/${v.bpDiastolic ?? "?"} · HR ${v.heartRate ?? "-"}` : tc("overviewVitalsReq")
          break
        case "airway":
          required = true
          done = v.mallampati != null || !!v.airwayUnobtainable
          summary = v.mallampati != null ? `Mallampati ${v.mallampati}` : tc("overviewMallampatiReq")
          break
        case "labs":
          done = (v.labResults?.length ?? 0) > 0
          summary = done ? `${v.labResults?.length} results` : tc("overviewLabsHint")
          break
        case "risk":
          required = true
          done = v.asaScore != null
          summary = v.asaScore != null ? `ASA ${v.asaScore}${v.emergencySurgery ? "E" : ""}` : tc("overviewASAReq")
          break
      }
      return { key, label, done, required, summary }
    })
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {preopMode === "overview" ? (
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <AppHeader title={tc("preopTitle")} showNewCase={false} />
            {preopCaseStatus === "COMPLETE" && preopFinalizedAt && (
              <EditWindowBanner finalizedAt={preopFinalizedAt} caseId={continueId ?? undefined} showBackButton />
            )}
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "900", marginBottom: 4 }}>{tc("preopTitle")}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 20 }}>{tc("tapSectionHint")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
                {computeSectionItems().map(({ key, label, done, required, summary }) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => jumpTo(key)}
                    style={{
                      width: "47%", minHeight: 80, justifyContent: "center", gap: 4,
                      borderRadius: 16, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 12,
                      backgroundColor: done ? withAlpha(colors.success, "12") : required ? withAlpha(colors.warning, "10") : colors.surfaceRaised,
                      borderWidth: 1.5,
                      borderColor: done ? withAlpha(colors.success, "77") : required ? withAlpha(colors.warning, "66") : colors.border,
                    }}
                  >
                    <Text style={{ color: done ? colors.success : required ? colors.warning : colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 }}>
                      {done ? tc("overviewReady") : required ? tc("overviewRequired") : tc("overviewOptional")}
                    </Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "900" }}>{label}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{summary}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                onPress={handleSubmit(onSubmit, (invalid) => {
                  const firstInvalid = Object.keys(invalid)[0]
                  const sectionMap: Record<string, PreopSection> = {
                    ageYears: "patient", sex: "patient",
                    bpSystolic: "exam", heartRate: "exam", spO2: "exam",
                    mallampati: "airway", airwayUnobtainable: "airway",
                    asaScore: "risk",
                  }
                  const target = sectionMap[firstInvalid]
                  if (target) jumpTo(target)
                  else Alert.alert(tc("requiredFieldsMissing"), "Check the highlighted sections.")
                })}
                disabled={saving}
                style={{
                  backgroundColor: colors.primary, borderRadius: 16, borderCurve: "continuous",
                  paddingVertical: 15, alignItems: "center", borderWidth: 1,
                  borderColor: withAlpha(colors.primary, "99"),
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>{tc("continueIntraop")}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        ) : <View style={{ flex: 1 }} {...(preopLayout === "sections" ? sectionSwipeResponder.panHandlers : {})}>
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 30,
            height: primaryHeaderHeight,
            overflow: "hidden",
            backgroundColor: colors.background,
            opacity: headerAnim.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 0.2, 0] }),
            transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -primaryHeaderHeight] }) }],
          }}
        >
          <AppHeader title={tc("preopTitle")} showNewCase={false} />
        </Animated.View>

        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 29,
            backgroundColor: colors.background,
            paddingTop: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [12, insets.top + 10] }),
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [primaryHeaderHeight, 0] }) }],
          }}
        >
          <ScrollView ref={sectionRailRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {SECTION_LABELS.map((section) => {
              const isActive = activeSection === section.key
              return (
                <View
                  key={section.key}
                  style={{ alignItems: "center" }}
                  onLayout={(e) => {
                    pillLayouts.current[section.key] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width }
                  }}
                >
                  <Pressable
                    onPress={() => jumpTo(section.key)}
                    style={{
                      minHeight: 44,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isActive ? withAlpha(colors.primary, "AA") : colors.border,
                      backgroundColor: isActive ? colors.primarySoft : colors.surfaceRaised,
                      paddingHorizontal: 17,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: isActive ? colors.primary : colors.textSecondary, fontSize: 13, fontWeight: "900" }}>{section.label}</Text>
                  </Pressable>
                  {isActive && (
                    <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.primary, width: "80%", marginTop: 3 }} />
                  )}
                </View>
              )
            })}
          </ScrollView>
        </Animated.View>

        <Animated.ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingTop: primaryHeaderHeight + SECTION_RAIL_EXPANDED_HEIGHT, paddingBottom: 90 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollYAnim } } }],
            { useNativeDriver: false, listener: handleScroll }
          )}
          scrollEventThrottle={16}
          {...(preopLayout === "sections" ? sectionPan.panHandlers : {})}
        >
          <Animated.View style={preopLayout === "sections" ? { transform: [{ translateX: slideAnim }, { scale: gestureScale }] } : undefined}>
          <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
            {draftState !== "idle" && (
              <Text style={{ color: draftState === "queued" ? colors.warning : colors.textMuted, fontSize: 11, fontWeight: "700", textAlign: "right", marginBottom: saveError ? 2 : 4 }}>
                {draftState === "saving" ? tc("draftSaving") : draftState === "saved" ? tc("draftSaved") : tc("draftLocal")}
              </Text>
            )}
            {saveError && draftState === "queued" && (
              <Text style={{ color: colors.danger, fontSize: 10, textAlign: "right", marginBottom: 4 }} selectable>
                {saveError}
              </Text>
            )}
            <SectionCard title={tc("sectionPatient")} onLayout={(y) => { sectionY.current.patient = y }} visible={showSection("patient")}>
              <Field label={tc("ageYears")} required error={errors.ageYears?.message}>
                <Controller control={control} name="ageYears" render={({ field }) => <ClinicalNumberInput value={field.value} onChange={field.onChange} min={ageRange?.min ?? 0} max={ageRange?.max ?? 150} step={ageRange?.step ?? 1} placeholder="Age" showSteppers={false} />} />
              </Field>
              <Field label={tc("heightCm")} required error={errors.heightCm?.message}>
                <Controller control={control} name="heightCm" render={({ field }) => {
                  const cv = convertedMeasurement("height", unitPrefs, field.value, field.onChange, heightRange?.min ?? 0, heightRange?.max ?? 250, heightRange?.step ?? 1)
                  return <ClinicalNumberInput value={cv.value} onChange={cv.onChange} min={cv.min} max={cv.max} step={cv.step} precision={cv.precision} unit={cv.unit} placeholder="Height" showSteppers={false} />
                }} />
              </Field>
              <Field label={tc("weightKg")} required error={errors.weightKg?.message}>
                <Controller control={control} name="weightKg" render={({ field }) => {
                  const cv = convertedMeasurement("weight", unitPrefs, field.value, field.onChange, weightRange?.min ?? 0, weightRange?.max ?? 250, weightRange?.step ?? 1)
                  return <ClinicalNumberInput value={cv.value} onChange={cv.onChange} min={cv.min} max={cv.max} step={cv.step} precision={cv.precision} unit={cv.unit} placeholder="Weight" showSteppers={false} />
                }} />
              </Field>
              {(bmi || ibw || abw) ? (
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                  {bmi ? <MetricBadge label="BMI" value={bmi.toFixed(1)} unit="kg/m2" tone={bmi >= 35 ? colors.warning : colors.primary} /> : null}
                  {ibw ? <MetricBadge label="IBW" value={String(Math.round(ibw))} unit="kg" tone={colors.agent} /> : null}
                  {abw ? <MetricBadge label="ABW" value={String(Math.round(abw))} unit="kg" tone={colors.fluid} /> : null}
                </View>
              ) : null}
              <Field label={tc("sexLabel")} required error={errors.sex?.message}>
                <Controller control={control} name="sex" render={({ field }) => (
                  <SegmentedSelect value={field.value} onChange={field.onChange} options={[{ value: "MALE", label: tc("male") }, { value: "FEMALE", label: tc("female") }, { value: "OTHER", label: tc("other") }]} />
                )} />
              </Field>
              <Field label={tc("bloodGroup")}>
                <BloodGrid bloodType={bloodType} rhFactor={rhFactor} onChange={(bt, rh) => { setValue("bloodType", bt); setValue("rhFactor", rh) }} />
              </Field>
            </SectionCard>

            <SectionCard title={tc("sectionCaseDetails")} onLayout={(y) => { sectionY.current.case = y }} visible={showSection("case")}>
              <Controller control={control} name="diagnoses" render={({ field }) => (
                <SearchTagInput label={tc("diagnosisLabel")} value={(field.value ?? []).map((item) => ({ code: item.code ?? item.label, label: item.label, system: item.system, labelEn: item.labelEn, labelBg: item.labelBg }))} onChange={(items) => field.onChange(items.map((item) => ({ code: item.code, sub: item.code, label: item.label, system: item.system ?? "ICD-10", labelEn: item.labelEn, labelBg: item.labelBg })))} endpoint="/api/search/icd10" placeholder={tc("diagnosisPlaceholder")} onFocus={() => scrollToSection("case", 60)} />
              )} />
              <Controller control={control} name="procedures" render={({ field }) => (
                <SearchTagInput label={tc("procedureLabel")} value={(field.value ?? []).map((item) => ({ code: item.code ?? item.label, label: item.label }))} onChange={(items) => field.onChange(items.map((item) => ({ code: item.code, label: item.label })))} endpoint="/api/search/procedures" placeholder="Search procedure..." onFocus={() => scrollToSection("case", 160)} />
              )} />
              <Controller control={control} name="highRiskSurgery" render={({ field }) => <ClinicalSwitchRow label={tc("highRiskSurgery")} value={!!field.value} onValueChange={field.onChange} activeColor={colors.warning} />} />
              <Controller control={control} name="emergencySurgery" render={({ field }) => (
                <ClinicalSwitchRow label={field.value ? tc("emergencySurgery") : tc("electiveSurgery")} value={!!field.value}
                  onValueChange={(v) => { field.onChange(v); setValue("elective", !v) }} activeColor={colors.danger} />
              )} />
              <Field label={tc("teamNotesLabel")}>
                <Controller control={control} name="teamNotes" render={({ field }) => (
                  <StyledInput value={field.value ?? ""} onChangeText={field.onChange} maxLength={500} multiline placeholder={tc("teamNotesPlaceholder")} />
                )} />
              </Field>
            </SectionCard>

            <SectionCard title={tc("sectionHistory")} subtitle={tc("historySubtitle")} onLayout={(y) => { sectionY.current.history = y }} visible={showSection("history")}>
              <Controller control={control} name="comorbidities" render={({ field }) => (
                <>
                  <SearchTagInput label={tc("activeComorbidities")} value={(field.value ?? []).map((item) => ({ code: item.code ?? item.label, label: item.label, system: item.system, labelEn: item.labelEn, labelBg: item.labelBg }))} onChange={(items) => field.onChange(items.map((item) => ({ code: item.code, sub: item.code, label: item.label, system: item.system ?? "ICD-10", labelEn: item.labelEn, labelBg: item.labelBg })))} endpoint="/api/search/icd10" placeholder={tc("searchComorbidities")} onFocus={() => scrollToSection("history", 80)} />
                  <ComorbiditiesBySystem
                    items={field.value ?? []}
                    onRemove={(label) => field.onChange((field.value ?? []).filter((c: { label: string }) => c.label !== label))}
                  />
                </>
              )} />
            </SectionCard>

            <SectionCard title={tc("sectionMeds")} onLayout={(y) => { sectionY.current.meds = y }} visible={showSection("meds")}>
              <Controller control={control} name="currentMedications" render={({ field }) => (
                <SearchTagInput label={tc("medicationSearch")} value={(field.value ?? []).map((item) => ({ code: item.label, label: item.label }))} onChange={(items) => field.onChange(items.map((item) => ({ label: item.label, inn: item.inn, atcCode: item.atcCode })))} endpoint="/api/search/drugs" placeholder={tc("searchMedications")} onFocus={() => scrollToSection("meds", 60)} />
              )} />
            </SectionCard>

            <SectionCard title={tc("sectionAnamnesis")} onLayout={(y) => { sectionY.current.anamnesis = y }} visible={showSection("anamnesis")}>
              <Controller control={control} name="allergies" render={({ field }) => <ClinicalSwitchRow label={tc("drugAllergy")} value={!!field.value} onValueChange={(value) => {
                field.onChange(value)
                if (!value) setValue("allergyDetails", [], { shouldDirty: true })
              }} activeColor={colors.danger} />} />
              {allergies ? (
                <Controller control={control} name="allergyDetails" render={({ field }) => (
                  <SearchTagInput label={tc("allergenSearch")} value={(field.value ?? []).map((item) => ({ code: item.label, label: item.label }))} onChange={(items) => field.onChange(items.map((item) => ({ label: item.label, inn: item.inn, atcCode: item.atcCode })))} endpoint="/api/search/drugs" placeholder="Search allergen..." onFocus={() => scrollToSection("history", 200)} />
                )} />
              ) : null}
              <Controller control={control} name="latexAllergy" render={({ field }) => <ClinicalSwitchRow label={tc("latexAllergy")} value={!!field.value} onValueChange={field.onChange} activeColor={colors.danger} />} />
              <Controller control={control} name="familyAnesthesiaProblems" render={({ field }) => <ClinicalSwitchRow label={tc("familyAnesthesia")} value={!!field.value} onValueChange={(value) => {
                field.onChange(value)
                if (!value) setValue("familyAnesthesiaDetails", "", { shouldDirty: true })
              }} activeColor={colors.warning} />} />
              {familyAnesthesiaProblems ? <Field label={tc("familyAnesthesiaDetails")}><Controller control={control} name="familyAnesthesiaDetails" render={({ field }) => <StyledInput value={field.value ?? ""} onChangeText={field.onChange} maxLength={500} multiline placeholder="MH, suxamethonium apnoea, unexplained anaesthesia death..." />} /></Field> : null}
              <Controller control={control} name="dentalProsthetics" render={({ field }) => <ClinicalSwitchRow label={tc("dentalProsthetics")} value={!!field.value} onValueChange={field.onChange} />} />
              <Controller control={control} name="looseTeeth" render={({ field }) => <ClinicalSwitchRow label={tc("looseTeeth")} value={!!field.value} onValueChange={field.onChange} activeColor={colors.warning} />} />
              <Controller control={control} name="smoking" render={({ field }) => <ClinicalSwitchRow label={tc("smoking")} value={!!field.value} onValueChange={field.onChange} />} />
              <Controller control={control} name="substanceAbuse" render={({ field }) => <ClinicalSwitchRow label={tc("substanceAbuse")} value={!!field.value} onValueChange={field.onChange} activeColor={colors.warning} />} />

              <SectionHeader title={tc("rcriSection")} />
              <ChecklistGroup>
                <Controller control={control} name="rcriIschemicHeart" render={({ field }) => <ChecklistRow label={tc("rcriIschemicHeart")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriIschemicHeart ? RCRI_HINT : undefined} />} />
                <Controller control={control} name="rcriCHF" render={({ field }) => <ChecklistRow label={tc("rcriCHF")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriCHF ? RCRI_HINT : undefined} />} />
                <Controller control={control} name="rcriCVD" render={({ field }) => <ChecklistRow label={tc("rcriCVD")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriCVD ? RCRI_HINT : undefined} />} />
                <Controller control={control} name="rcriInsulinDM" render={({ field }) => <ChecklistRow label={tc("rcriInsulinDM")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriInsulinDM ? RCRI_HINT : undefined} />} />
                <Controller control={control} name="rcriCreatinine" render={({ field }) => <ChecklistRow label={tc("rcriCreatinine")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriCreatinine ? RCRI_HINT : undefined} last />} />
              </ChecklistGroup>

              <SectionHeader title={tc("apfelSection")} />
              <ChecklistGroup>
                <ChecklistRow label={tc("apfelFemaleSex")} checked={sex === "FEMALE"} muted />
                <ChecklistRow label={tc("apfelNonSmoker")} checked={!smoking} muted />
                <Controller control={control} name="apfelPONVHistory" render={({ field }) => <ChecklistRow label={tc("apfelPONV")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} />
                <Controller control={control} name="apfelPostopOpioids" render={({ field }) => <ChecklistRow label={tc("apfelOpioids")} checked={!!field.value} onPress={() => field.onChange(!field.value)} last />} />
              </ChecklistGroup>

              <SectionHeader title={tc("stopbangSection")} />
              <ChecklistGroup>
                <Controller control={control} name="stopbangSnoring" render={({ field }) => <ChecklistRow label={tc("stopbangSnoring")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} />
                <Controller control={control} name="stopbangTired" render={({ field }) => <ChecklistRow label={tc("stopbangTired")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} />
                <Controller control={control} name="stopbangObserved" render={({ field }) => <ChecklistRow label={tc("stopbangObserved")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} />
                <Controller control={control} name="stopbangBP" render={({ field }) => <ChecklistRow label={tc("stopbangBP")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={stopBangBPSuggested ? RCRI_HINT : undefined} />} />
                <ChecklistRow label={`${tc("stopbangBMI")}: ${bmi ? bmi.toFixed(1) : "-"}`} checked={bmi != null && bmi > 35} muted />
                <ChecklistRow label={`${tc("stopbangAge")}: ${ageYears ?? "-"}`} checked={ageYears != null && ageYears > 50} muted />
                <Controller control={control} name="stopbangNeck" render={({ field }) => <ChecklistRow label={tc("stopbangNeck")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} />
                <ChecklistRow label={tc("stopbangMale")} checked={sex === "MALE"} muted last />
              </ChecklistGroup>
            </SectionCard>

            <SectionCard title={tc("sectionExam")} onLayout={(y) => { sectionY.current.exam = y }} visible={showSection("exam")}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Controller control={control} name="bpSystolic" render={({ field }) => (
                    <Controller control={control} name="bpUnobtainable" render={({ field: uto }) => (
                      <VitalNumber label={tc("sbpLabel")} unit="mmHg" value={field.value} onChange={field.onChange} min={bpSystolicRange?.min ?? 1} max={bpSystolicRange?.max ?? 300} step={bpSystolicRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
                    )} />
                  )} />
                </View>
                <View style={{ flex: 1 }}>
                  <Controller control={control} name="bpDiastolic" render={({ field }) => (
                    <Controller control={control} name="bpUnobtainable" render={({ field: uto }) => (
                      <VitalNumber label={tc("dbpLabel")} unit="mmHg" value={field.value} onChange={field.onChange} min={bpDiastolicRange?.min ?? 1} max={bpDiastolicRange?.max ?? 200} step={bpDiastolicRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
                    )} />
                  )} />
                </View>
              </View>
              <Controller control={control} name="heartRate" render={({ field }) => (
                <Controller control={control} name="heartRateUnobtainable" render={({ field: uto }) => (
                  <VitalNumber label={tc("heartRateLabel")} unit="bpm" value={field.value} onChange={field.onChange} min={heartRateRange?.min ?? 1} max={heartRateRange?.max ?? 300} step={heartRateRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
                )} />
              )} />
              <Controller control={control} name="heartArrhythmia" render={({ field }) => <ClinicalSwitchRow label={tc("arrhythmiaLabel")} value={!!field.value} onValueChange={field.onChange} activeColor={colors.warning} />} />
              <Controller control={control} name="spO2" render={({ field }) => (
                <Controller control={control} name="spO2Unobtainable" render={({ field: uto }) => (
                  <VitalNumber label={tc("spO2Label")} unit="%" value={field.value} onChange={field.onChange} min={spo2Range?.min ?? 0} max={spo2Range?.max ?? 100} step={spo2Range?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
                )} />
              )} />
              <Controller control={control} name="temperature" render={({ field }) => (
                <Controller control={control} name="temperatureUnobtainable" render={({ field: uto }) => {
                  const cv = convertedMeasurement("temperature", unitPrefs, field.value, field.onChange, temperatureRange?.min ?? 0, temperatureRange?.max ?? 45, temperatureRange?.step ?? 0.1)
                  return <VitalNumber label={tc("temperatureLabel")} unit={cv.unit} value={cv.value} onChange={cv.onChange} min={cv.min} max={cv.max} step={cv.step} precision={cv.precision || 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
                }} />
              )} />
              <Controller control={control} name="respiratoryRate" render={({ field }) => (
                <Controller control={control} name="respiratoryRateUnobtainable" render={({ field: uto }) => (
                  <VitalNumber label={tc("respiratoryRateLabel")} unit="/min" value={field.value} onChange={field.onChange} min={respiratoryRange?.min ?? 0} max={respiratoryRange?.max ?? 50} step={respiratoryRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
                )} />
              )} />
              <Field label={tc("physicalExamReport")}>
                <Controller control={control} name="physicalExamReport" render={({ field }) => <StyledInput value={field.value ?? ""} onChangeText={field.onChange} maxLength={500} multiline placeholder="General appearance, relevant exam findings..." />} />
              </Field>
            </SectionCard>

            <SectionCard title={tc("sectionAirway")} onLayout={(y) => { sectionY.current.airway = y }} visible={showSection("airway")}>
              <Controller control={control} name="airwayUnobtainable" render={({ field }) => <ClinicalSwitchRow label={field.value ? tc("airwayUnableToObtain") : tc("unableToObtain")} value={!!field.value} onValueChange={field.onChange} activeColor={colors.warning} />} />
              {!airwayUnobtainable ? (
                <>
                  <Field label={tc("mallampatiLabel")}>
                    <Controller control={control} name="mallampati" render={({ field }) => <SegmentedSelect value={field.value} onChange={field.onChange} options={mallampatiOptions.map(o => ({ value: o.value, label: o.value }))} />} />
                  </Field>
                  <Field label={tc("mouthOpeningLabel")}>
                    <Controller control={control} name="mouthOpeningCm" render={({ field }) => <ClinicalNumberInput value={field.value} onChange={field.onChange} min={mouthOpeningRange?.min ?? 0} max={mouthOpeningRange?.max ?? 10} step={mouthOpeningRange?.step ?? 0.5} precision={1} unit="cm" placeholder="Mouth opening" quickValues={[3, 3.5, 4, 4.5, 5]} showSteppers={false} />} />
                  </Field>
                  <Field label={tc("thyromental")}>
                    <Controller control={control} name="thyromental" render={({ field }) => <ClinicalNumberInput value={field.value} onChange={field.onChange} min={thyromentalRange?.min ?? 0} max={thyromentalRange?.max ?? 15} step={thyromentalRange?.step ?? 1} precision={0} unit="cm" placeholder="Thyromental" quickValues={[5, 6, 7, 8, 9]} showSteppers={false} />} />
                  </Field>
                  <Field label={tc("neckMobility")}>
                    <Controller control={control} name="neckMobility" render={({ field }) => <SegmentedSelect value={field.value} onChange={field.onChange} options={neckMobilityOptions.map(o => ({ value: o.value, label: lbl(o) }))} />} />
                  </Field>
                  <Field label={tc("ulbtLabel")}>
                    <Controller control={control} name="upperLipBiteTest" render={({ field }) => <SegmentedSelect value={field.value} onChange={field.onChange} options={upperLipBiteOptions.map(o => ({ value: o.value, label: lbl(o) }))} />} />
                  </Field>
                  <Field label={tc("cormackLehane")}>
                    <Controller control={control} name="cormackLehane" render={({ field }) => <SegmentedSelect value={field.value} onChange={field.onChange} options={cormackLehaneOptions.map(o => ({ value: o.value, label: o.value }))} />} />
                  </Field>
                  <Controller control={control} name="retrognathia" render={({ field }) => <ClinicalSwitchRow label={tc("retrognathia")} value={!!field.value} onValueChange={field.onChange} />} />
                  <Controller control={control} name="prominentIncisors" render={({ field }) => <ClinicalSwitchRow label={tc("prominentIncisors")} value={!!field.value} onValueChange={field.onChange} />} />
                  <Controller control={control} name="facialHair" render={({ field }) => <ClinicalSwitchRow label={tc("facialHair")} value={!!field.value} onValueChange={field.onChange} />} />
                  <Controller control={control} name="difficultAirwayHistory" render={({ field }) => <ClinicalSwitchRow label={tc("difficultAirwayHx")} value={!!field.value} onValueChange={(value) => {
                    field.onChange(value)
                    if (!value) setValue("difficultAirwayNotes", "", { shouldDirty: true })
                  }} activeColor={colors.danger} />} />
                  {difficultAirwayHistory ? <Field label={tc("difficultAirwayNotes")}><Controller control={control} name="difficultAirwayNotes" render={({ field }) => <StyledInput value={field.value ?? ""} onChangeText={field.onChange} maxLength={500} multiline placeholder="Previous grade, technique, rescue device..." />} /></Field> : null}
                </>
              ) : null}
            </SectionCard>

            <SectionCard title={tc("sectionLabs")} subtitle={tc("labsPrivacyNote")} onLayout={(y) => { sectionY.current.labs = y }} visible={showSection("labs")}>
              <Controller control={control} name="labResults" render={({ field }) => (
                <>
                  <LabScanPanel value={field.value ?? []} onAddResults={(results) => field.onChange([...(field.value ?? []), ...results])} />
                  <ManualLabPanel value={field.value ?? []} onChange={field.onChange} labelManualLabEntry={tc("manualLabEntry")} labelHideManualLab={tc("hideManualLab")} labelSearchLabs={tc("searchLabs")} />
                </>
              )} />
            </SectionCard>

            <SectionCard title={tc("sectionRisk")} onLayout={(y) => { sectionY.current.risk = y }} visible={showSection("risk")}>
              <Field label={tc("asaPhysicalStatus")} required error={errors.asaScore?.message}>
                <Controller control={control} name="asaScore" render={({ field }) => (
                  <AsaPicker
                    value={field.value}
                    onChange={(v) => field.onChange(v || undefined)}
                    emergencySurgery={!!emergencySurgery}
                    suggestion={asaSuggestion}
                    labelSuggested={tc("asaSuggested")}
                    labelSuggestedReview={tc("asaSuggestedReview")}
                    labelEmergencySuffix={tc("emergencySuffix")}
                  />
                )} />
              </Field>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                <ScoreBadge label="RCRI" score={rcriScore} max={6} riskLabel={rcriRiskLabel(rcriScore, tc)} />
                <ScoreBadge label="Apfel" score={apfelScore} max={4} riskLabel={apfelRiskLabel(apfelScore, tc)} />
                <ScoreBadge label="STOP-BANG" score={stopBangScore} max={8} riskLabel={stopBangRiskLabel(stopBangScore, tc)} />
              </View>
              <Controller control={control} name="aiOptIn" render={({ field }) => (
                <AiAdvisorPanel
                  aiOptIn={!!field.value}
                  onToggleOptIn={field.onChange}
                  analysing={aiLoading}
                  streamedText={aiText}
                  error={aiError}
                  onRun={runAdvisor}
                  tc={tc}
                />
              )} />
            </SectionCard>

            <PrimaryButton label={tc("continueIntraop")} onPress={handleSubmit(onSubmit, (invalid) => Alert.alert(tc("requiredFieldsMissing"), Object.keys(invalid).join(", ") || "Check the highlighted fields."))} loading={saving} />
          </View>
          </Animated.View>
        </Animated.ScrollView>

        {scrollRailVisible && preopLayout !== "sections" ? (
          <View pointerEvents="none" style={{ position: "absolute", right: 6, top: appHeaderHidden ? insets.top + 78 : 182, bottom: 34, width: 210, alignItems: "flex-end" }}>
            <View onLayout={(event) => setRailHeight(Math.max(1, event.nativeEvent.layout.height))} style={{ flex: 1, width: 18, alignItems: "center", justifyContent: "center" }}>
              <View style={{ position: "absolute", top: 0, bottom: 0, width: 3, borderRadius: 999, backgroundColor: withAlpha(colors.borderStrong, "AA") }} />
              <Animated.View
                style={{
                  position: "absolute",
                  top: 0,
                  width: 3,
                  height: scrollYAnim.interpolate({ inputRange: [0, maxScrollY], outputRange: [0, railHeight], extrapolate: "clamp" }),
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                }}
              />
              <Animated.View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 4,
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                  transform: [{ translateY: scrollYAnim.interpolate({ inputRange: [0, maxScrollY], outputRange: [-5, railHeight - 5], extrapolate: "clamp" }) }],
                }}
              />
              <Animated.View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 24,
                  transform: [{ translateY: scrollYAnim.interpolate({ inputRange: [0, maxScrollY], outputRange: [-14, railHeight - 14], extrapolate: "clamp" }) }],
                  minWidth: 86,
                  maxWidth: 176,
                  borderRadius: 999,
                  backgroundColor: withAlpha(colors.background, "F2"),
                  borderWidth: 1,
                  borderColor: withAlpha(colors.primary, "77"),
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900", textAlign: "center" }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {SECTION_LABELS.find((section) => section.key === activeSection)?.label}
                </Text>
              </Animated.View>
            </View>
          </View>
        ) : null}
          {/* FAB — go back to section overview */}
          <TouchableOpacity
            onPress={() => { preopModeRef.current = "overview"; setPreopMode("overview") }}
            style={{
              position: "absolute", bottom: insets.bottom + 24, right: 20,
              width: 50, height: 50, borderRadius: 25,
              backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
              shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18, lineHeight: 20, fontWeight: "900" }}>⊞</Text>
          </TouchableOpacity>
        </View>}
      </KeyboardAvoidingView>
    </>
  )
}
