import { useCallback, useEffect, useRef, useState } from "react"
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Switch, KeyboardAvoidingView, Platform,
} from "react-native"
import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import { useForm, Controller, useWatch } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { ApiError, apiJson } from "@/lib/api"
import { flushQueuedCasePatch, saveCasePatchWithQueue, type CasePatchResponse, type CasePatchResult } from "@/lib/offline-case-patches"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { ScreenState } from "@/components/clinical-ui"
import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { VitalNumber } from "@/components/VitalStepper"
import { convertedMeasurement } from "@/lib/use-converted-measurement"
import { colors, withAlpha } from "@/theme/colors"
import { useCaseLock } from "@/lib/use-case-lock"
import { WatchingOverlay } from "@/components/WatchingOverlay"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"
import { useRangeSpec } from "@/lib/use-option-library"

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  aldreteActivity:      z.number().min(0).max(2).default(0),
  aldreteRespiration:   z.number().min(0).max(2).default(0),
  aldreteCirculation:   z.number().min(0).max(2).default(0),
  aldreteConsciousness: z.number().min(0).max(2).default(0),
  aldreteSpO2:          z.number().min(0).max(2).default(0),
  recoveryBpSystolic:   z.number().optional(),
  recoveryBpDiastolic:  z.number().optional(),
  recoveryHeartRate:    z.number().optional(),
  recoverySpO2:         z.number().optional(),
  temperatureCelsius:   z.number().optional(),
  painScoreNRS:       z.number().min(0).max(10).optional(),
  ponv:               z.boolean().default(false),
  recoveryBpUnobtainable:          z.boolean().default(false),
  recoveryHeartRateUnobtainable:   z.boolean().default(false),
  recoverySpO2Unobtainable:        z.boolean().default(false),
  recoveryTemperatureUnobtainable: z.boolean().default(false),
  disposition:        z.enum(["WARD", "PACU", "ICU"]).optional(),
  dispositionNotes:   z.string().optional(),
  handoverItems:      z.array(z.string()).default([]),
})

type FormInput = z.input<typeof schema>
type FormData = z.output<typeof schema>
type AutosaveState = "idle" | "saving" | "saved" | "queued" | "conflict" | "error"

// ─── Data ─────────────────────────────────────────────────────────────────────

type HandoverGroup = {
  id: string
  title: string
  items: { v: string; label: string }[]
}

// Maps legacy mobile/web codes → canonical codes
const HANDOVER_CODE_ALIASES: Record<string, string> = {
  obs_q15: "obs_freq", obs_q30: "spo2_cont", obs_bp: "alert_bp", obs_temp: "temp_monitor",
  o2_therapy: "o2_supp", pain_regular: "analgesia_protocol", pain_pca: "pca",
  pain_threshold: "alert_pain", antiemetic: "antiemetic_prn", regular_meds: "resume_meds",
  dvt_chemical: "dvt_lmwh", pending_labs: "bloods", pending_imaging: "cxr",
  consult_request: "pain_team",
}
function normaliseHandoverCodes(codes: string[]): string[] {
  return codes.map(c => HANDOVER_CODE_ALIASES[c] ?? c)
}

const HANDOVER_TC_TITLES: Record<string, ClinicalStringKey> = {
  obs:             "hvgVitalSigns",
  airway:          "hvgAirway",
  cvs:             "hvgCardiovascular",
  pain:            "hvgPain",
  ponv:            "hvgPONV",
  meds:            "hvgMeds",
  investigations:  "hvgInvestigations",
  consultations:   "hvgConsultations",
}

const HANDOVER_TC_ITEMS: Record<string, ClinicalStringKey> = {
  obs_freq:           "hviObsFreq",
  spo2_cont:          "hviSpO2Cont",
  alert_bp:           "hviAlertBP",
  temp_monitor:       "hviTempMonitor",
  urine_output:       "hviUrineOutput",
  glucose:            "hviGlucose",
  o2_supp:            "hviO2Supp",
  npo:                "hviNPO",
  diet_advance:       "hviDietAdvance",
  alert_resp:         "hviAlertResp",
  airway_alert:       "hviAirwayAlert",
  airway_position:    "hviAirwayPosition",
  piv:                "hviPIV",
  cvk:                "hviCVK",
  art_line:           "hviArtLine",
  alert_hr:           "hviAlertHR",
  fluid_plan:         "hviFluidPlan",
  fluid_balance:      "hviFluidBalance",
  antihypertensive:   "hviAntihypertensive",
  anticoagulation:    "hviAnticoagulation",
  analgesia_protocol: "hviAnalgesia",
  pca:                "hviPCA",
  epidural_catheter:  "hviEpiduralCath",
  nerve_catheter:     "hviNerveCath",
  pain_rescue:        "hviPainRescue",
  alert_pain:         "hviAlertPain",
  antiemetic_prn:     "hviAntiemetic",
  ponv_protocol:      "hviPONVProtocol",
  oral_intake:        "hviOralIntake",
  ngt:                "hviNGT",
  resume_meds:        "hviResumeMeds",
  dvt_lmwh:           "hviDVT_LMWH",
  dvt_mechanical:     "hviDVTMech",
  mobilisation:       "hviMobilisation",
  stress_ulcer:       "hviStressUlcer",
  antibiotics:        "hviAntibiotics",
  insulin:            "hviInsulin",
  steroids:           "hviSteroids",
  bloods:             "hviBlocksBlood",
  ecg:                "hviECG",
  cxr:                "hviCXR",
  pain_team:          "hviPainTeam",
  physio:             "hviPhysio",
  dietitian:          "hviDietitian",
  wound_care:         "hviWoundCare",
  follow_up:          "hviFollowUp",
}

const HANDOVER_GROUPS: HandoverGroup[] = [
  {
    id: "obs",
    title: "Vital Signs & Monitoring",
    items: [
      { v: "obs_freq",     label: "Observations q15 min × 1h, then q30 min × 1h" },
      { v: "spo2_cont",    label: "Continuous SpO₂ monitoring" },
      { v: "alert_bp",     label: "Blood pressure — target range communicated" },
      { v: "temp_monitor", label: "Temperature monitoring / active warming" },
      { v: "urine_output", label: "Urine output monitoring (IDC in situ)" },
      { v: "glucose",      label: "Serum/peripheral glucose monitoring" },
    ],
  },
  {
    id: "airway",
    title: "Airway & Oxygen",
    items: [
      { v: "o2_supp",         label: "Supplemental O₂ — rate and duration specified" },
      { v: "npo",             label: "Fasting status / nil by mouth until fully awake" },
      { v: "diet_advance",    label: "Advance diet when tolerating" },
      { v: "alert_resp",      label: "Alert if SpO₂ < 92% or RR < 8 or > 25/min" },
      { v: "airway_alert",    label: "Difficult airway — alert at bedside" },
      { v: "airway_position", label: "Position: head up / lateral / as specified" },
    ],
  },
  {
    id: "cvs",
    title: "Cardiovascular",
    items: [
      { v: "piv",              label: "Peripheral IV in situ" },
      { v: "cvk",              label: "Central venous catheter in situ" },
      { v: "art_line",         label: "Arterial line in situ" },
      { v: "alert_hr",         label: "Alert if HR < 50 or > 120 bpm" },
      { v: "fluid_plan",       label: "IV fluid plan — type, rate, volume specified" },
      { v: "fluid_balance",    label: "Fluid balance monitoring and documentation" },
      { v: "antihypertensive", label: "Antihypertensive medications resumed / held" },
      { v: "anticoagulation",  label: "Anticoagulation plan documented" },
    ],
  },
  {
    id: "pain",
    title: "Pain Management",
    items: [
      { v: "analgesia_protocol", label: "Regular analgesic schedule prescribed" },
      { v: "pca",                label: "PCA / epidural — pump settings checked" },
      { v: "epidural_catheter",  label: "Epidural catheter — pain team to review" },
      { v: "nerve_catheter",     label: "Peripheral nerve catheter in situ" },
      { v: "pain_rescue",        label: "Rescue analgesia — drug, dose, frequency" },
      { v: "alert_pain",         label: "Alert if NRS pain score > 4 at rest" },
    ],
  },
  {
    id: "ponv",
    title: "PONV & GI",
    items: [
      { v: "antiemetic_prn", label: "Antiemetics PRN / antiemetic regime prescribed" },
      { v: "ponv_protocol",  label: "PONV prophylaxis" },
      { v: "oral_intake",    label: "Resume oral intake when tolerating" },
      { v: "ngt",            label: "NGT in situ — position confirmed / output documented" },
    ],
  },
  {
    id: "meds",
    title: "Medications & Prophylaxis",
    items: [
      { v: "resume_meds",   label: "Regular medications resumed / held — list confirmed" },
      { v: "dvt_lmwh",      label: "Chemical DVT prophylaxis — LMWH dose and timing" },
      { v: "dvt_mechanical", label: "Mechanical DVT prophylaxis — compression stockings / IPC" },
      { v: "mobilisation",   label: "Early mobilisation plan documented" },
      { v: "stress_ulcer",   label: "Stress ulcer prophylaxis" },
      { v: "antibiotics",    label: "Antibiotic course continued / completed" },
      { v: "insulin",        label: "Insulin / diabetic management protocol active" },
      { v: "steroids",       label: "Steroid supplementation if applicable" },
    ],
  },
  {
    id: "investigations",
    title: "Investigations",
    items: [
      { v: "bloods", label: "Blood tests in ___ hours" },
      { v: "ecg",    label: "12-lead ECG" },
      { v: "cxr",    label: "Chest X-ray / pending imaging follow-up" },
    ],
  },
  {
    id: "consultations",
    title: "Consultations & Follow-up",
    items: [
      { v: "pain_team",  label: "Pain management team review" },
      { v: "physio",     label: "Physiotherapy" },
      { v: "dietitian",  label: "Dietitian / nutritional support" },
      { v: "wound_care", label: "Wound / drain care instructions documented" },
      { v: "follow_up",  label: "Follow-up appointment / plan communicated" },
    ],
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 10, marginTop: 20 }}>
      {title}
    </Text>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>{label}</Text>
      {children}
      {error && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  )
}

// 3-button row for 0 / 1 / 2 Aldrete scores
function ScoreRow({
  label: _label,
  value,
  onChange,
  descriptions,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  descriptions: [string, string, string]
}) {
  return (
    <View className="flex-row gap-2">
      {([0, 1, 2] as const).map((score) => {
        const selected = value === score
        return (
          <TouchableOpacity
            key={score}
            onPress={() => onChange(score)}
            style={{
              flex: 1,
              borderRadius: 14,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primarySoft : colors.surfaceRaised,
              paddingVertical: 12,
              paddingHorizontal: 8,
              alignItems: "center",
              minHeight: 76,
            }}
          >
            <Text style={{ color: selected ? colors.primary : colors.textMuted, fontSize: 18, fontWeight: "900", marginBottom: 3 }}>
              {score}
            </Text>
            <Text
              style={{ color: selected ? colors.textPrimary : colors.textMuted, fontSize: 10, textAlign: "center", lineHeight: 13 }}
              numberOfLines={2}
            >
              {descriptions[score]}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// Row of 11 numbered buttons for NRS 0–10
function NRSRow({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {Array.from({ length: 11 }, (_, i) => i).map((n) => {
        const selected = value === n
        return (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: selected ? colors.warning : colors.border,
              backgroundColor: selected ? withAlpha(colors.warning, "22") : colors.surfaceRaised,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: selected ? colors.warning : colors.textSecondary, fontSize: 14, fontWeight: "800" }}>
              {n}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// Disposition pill picker
function DispositionPicker({
  value,
  onChange,
  wardLabel,
  pacuLabel,
  icuLabel,
}: {
  value: "WARD" | "PACU" | "ICU" | undefined
  onChange: (v: "WARD" | "PACU" | "ICU" | undefined) => void
  wardLabel: string
  pacuLabel: string
  icuLabel: string
}) {
  const OPTIONS: { v: "WARD" | "PACU" | "ICU"; label: string; color: string }[] = [
    { v: "WARD", label: wardLabel, color: colors.success },
    { v: "PACU", label: pacuLabel, color: colors.warning },
    { v: "ICU",  label: icuLabel,  color: colors.danger },
  ]
  return (
    <View className="flex-row gap-3">
      {OPTIONS.map((opt) => {
        const selected = value === opt.v
        return (
          <TouchableOpacity
            key={opt.v}
            onPress={() => onChange(selected ? undefined : opt.v)}
            style={{
              flex: 1,
              minHeight: 72,
              borderRadius: 14,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: selected ? opt.color : colors.border,
              backgroundColor: selected ? withAlpha(opt.color, "22") : colors.surfaceRaised,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: selected ? opt.color : colors.textPrimary, fontSize: 16, fontWeight: "900" }}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// Multi-toggle checkboxes for handover items — grouped
function HandoverChecklist({
  value,
  onChange,
}: {
  value: string[]
  onChange: (v: string[]) => void
}) {
  const { tc } = usePreferences()
  const [expanded, setExpanded] = useState<string[]>(HANDOVER_GROUPS.map(g => g.id))

  function toggle(item: string) {
    onChange(value.includes(item) ? value.filter((x) => x !== item) : [...value, item])
  }

  function toggleGroup(groupId: string) {
    setExpanded(prev => prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId])
  }

  function groupCheckedCount(group: HandoverGroup) {
    return group.items.filter(i => value.includes(i.v)).length
  }

  return (
    <View style={{ gap: 8 }}>
      {HANDOVER_GROUPS.map((group) => {
        const isOpen = expanded.includes(group.id)
        const checkedCount = groupCheckedCount(group)
        const allChecked = checkedCount === group.items.length
        return (
          <View key={group.id} style={{ backgroundColor: colors.surfaceRaised, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: allChecked ? withAlpha(colors.success, "66") : colors.border, overflow: "hidden" }}>
            <TouchableOpacity
              onPress={() => toggleGroup(group.id)}
              style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}
            >
              <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: "800" }}>
                {HANDOVER_TC_TITLES[group.id] ? tc(HANDOVER_TC_TITLES[group.id]) : group.title}
              </Text>
              <Text style={{ color: checkedCount > 0 ? colors.success : colors.textMuted, fontSize: 12, fontWeight: "800" }}>
                {checkedCount}/{group.items.length}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{isOpen ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {isOpen && group.items.map((opt) => {
              const checked = value.includes(opt.v)
              return (
                <TouchableOpacity
                  key={opt.v}
                  onPress={() => toggle(opt.v)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: checked ? withAlpha(colors.success, "08") : "transparent" }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: checked ? colors.success : colors.borderStrong, backgroundColor: checked ? colors.success : "transparent", alignItems: "center", justifyContent: "center" }}>
                    {checked && <Text style={{ color: colors.background, fontSize: 13, fontWeight: "900", lineHeight: 15 }}>✓</Text>}
                  </View>
                  <Text style={{ color: checked ? colors.textPrimary : colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>
                    {HANDOVER_TC_ITEMS[opt.v] ? tc(HANDOVER_TC_ITEMS[opt.v]) : opt.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

function RecoverySummary({
  total,
  label,
  disposition,
  pain,
  ponv,
}: {
  total: number
  label: string
  disposition?: "WARD" | "PACU" | "ICU"
  pain?: number
  ponv?: boolean
}) {
  const { t } = usePreferences()
  const statusColor = total >= 9 ? colors.success : total >= 7 ? colors.warning : colors.danger
  const dispoColor = disposition === "ICU" ? colors.danger : disposition === "PACU" ? colors.warning : colors.success
  return (
    <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: 16, borderCurve: "continuous", borderWidth: 1, borderColor: withAlpha(statusColor, "66"), padding: 16, marginTop: 10, marginBottom: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" }}>{t("aldreteLabel")}</Text>
          <Text style={{ color: statusColor, fontSize: 40, fontWeight: "900", fontVariant: ["tabular-nums"], marginTop: 2 }}>
            {total}<Text style={{ color: colors.textMuted, fontSize: 18 }}> / 10</Text>
          </Text>
          <Text style={{ color: statusColor, fontSize: 13, fontWeight: "800" }}>{label}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Text style={{ color: disposition ? dispoColor : colors.textMuted, fontSize: 18, fontWeight: "900" }}>
            {disposition ?? t("noDisposition")}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t("painLabel")} {pain ?? "-"}/10</Text>
          <Text style={{ color: ponv ? colors.warning : colors.textMuted, fontSize: 12 }}>{ponv ? t("ponvPresent") : t("noPONV")}</Text>
        </View>
      </View>
    </View>
  )
}

export default function PostopFormScreen() {
  const { id, continuedItems } = useLocalSearchParams<{ id: string; continuedItems?: string }>()
  const router    = useRouter()
  const { tc, t, heightUnit, weightUnit, temperatureUnit, etco2Unit } = usePreferences()
  const unitPrefs = { heightUnit, weightUnit, temperatureUnit, etco2Unit }
  const recoveryBpSystolicRange  = useRangeSpec("BP_SYSTOLIC_RANGE")
  const recoveryBpDiastolicRange = useRangeSpec("BP_DIASTOLIC_RANGE")
  const recoveryHeartRateRange   = useRangeSpec("HEART_RATE_RANGE")
  const recoverySpo2Range        = useRangeSpec("SPO2_RANGE")
  const recoveryTemperatureRange = useRangeSpec("TEMPERATURE_RANGE")
  const _painNrsRange            = useRangeSpec("PAIN_NRS_RANGE")
  const { isWatching, takeover } = useCaseLock(id, true)
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null)
  const [caseStatus,  setCaseStatus]  = useState<string | null>(null)
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("idle")
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const lastSavedJsonRef = useRef("")
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const baseUpdatedAtRef = useRef<string | null>(null)

  // ─── ALDRETE_CRITERIA defined inside component so it can use tc() ──────────
  const ALDRETE_CRITERIA: {
    field: keyof Pick<FormData, "aldreteActivity" | "aldreteRespiration" | "aldreteCirculation" | "aldreteConsciousness" | "aldreteSpO2">
    label: string
    descriptions: [string, string, string]
  }[] = [
    {
      field: "aldreteActivity",
      label: tc("aldreteActivity"),
      descriptions: [tc("aldreteNoMovement"), tc("aldrete2Extremities"), tc("aldreteAllExtremities")],
    },
    {
      field: "aldreteRespiration",
      label: tc("aldreteRespiration"),
      descriptions: [tc("aldreteApnoeic"), tc("aldreteShallow"), tc("aldreteDeepBreath")],
    },
    {
      field: "aldreteCirculation",
      label: tc("aldreteCirculation"),
      descriptions: [tc("aldreteBP50"), tc("aldreteBP20to49"), tc("aldreteBP20")],
    },
    {
      field: "aldreteConsciousness",
      label: tc("aldreteConsciousness"),
      descriptions: [tc("aldreteNoResponse"), tc("aldreteArousable"), tc("aldreteAwake")],
    },
    {
      field: "aldreteSpO2",
      label: tc("aldreteSpO2"),
      descriptions: [tc("aldreteSpO2Low"), tc("aldreteSpO2Mid"), tc("aldreteSpO2High")],
    },
  ]

  const { control, handleSubmit, reset, getValues, setValue } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      aldreteActivity:      0,
      aldreteRespiration:   0,
      aldreteCirculation:   0,
      aldreteConsciousness: 0,
      aldreteSpO2:          0,
      ponv:               false,
      handoverItems:      [],
    },
  })

  // Watch all five Aldrete score fields to compute the live total
  const aldreteActivity      = useWatch({ control, name: "aldreteActivity" })
  const aldreteRespiration   = useWatch({ control, name: "aldreteRespiration" })
  const aldreteCirculation   = useWatch({ control, name: "aldreteCirculation" })
  const aldreteConsciousness = useWatch({ control, name: "aldreteConsciousness" })
  const aldreteSpO2          = useWatch({ control, name: "aldreteSpO2" })
  const disposition        = useWatch({ control, name: "disposition" })
  const handoverItems      = useWatch({ control, name: "handoverItems" }) ?? []
  const dispositionNotes   = useWatch({ control, name: "dispositionNotes" })
  const painScoreNRS       = useWatch({ control, name: "painScoreNRS" })
  const ponv               = useWatch({ control, name: "ponv" })
  const formValues         = useWatch({ control })

  useEffect(() => {
    if (disposition === "WARD" || disposition === "PACU") return
    if (handoverItems.length) setValue("handoverItems", [], { shouldDirty: true })
    if (dispositionNotes) setValue("dispositionNotes", "", { shouldDirty: true })
  }, [disposition, dispositionNotes, handoverItems.length, setValue])

  const aldreteTotal =
    (aldreteActivity ?? 0) +
    (aldreteRespiration ?? 0) +
    (aldreteCirculation ?? 0) +
    (aldreteConsciousness ?? 0) +
    (aldreteSpO2 ?? 0)

  const aldreteLabel =
    aldreteTotal >= 9
      ? tc("summaryReadyDischarge")
      : aldreteTotal >= 7
      ? tc("summaryMonitor")
      : tc("summaryContinueRecovery")

  type PostopRecord = Partial<FormData> & {
    activityScore?: number
    respirationScore?: number
    circulationScore?: number
    consciousnessScore?: number
    spO2Score?: number
    temperaturePostop?: number
    updatedAt?: string
  }
  type CaseResponse = { postop?: PostopRecord; finalizedAt?: string | null; status?: string }

  const valuesFromPostop = useCallback((p: PostopRecord): FormData => {
    return {
      aldreteActivity:      p.aldreteActivity      ?? p.activityScore      ?? 0,
      aldreteRespiration:   p.aldreteRespiration   ?? p.respirationScore   ?? 0,
      aldreteCirculation:   p.aldreteCirculation   ?? p.circulationScore   ?? 0,
      aldreteConsciousness: p.aldreteConsciousness ?? p.consciousnessScore ?? 0,
      aldreteSpO2:          p.aldreteSpO2          ?? p.spO2Score          ?? 0,
      // Recovery vitals — same ranges + random pre-fill as the preop exam form
      recoveryBpSystolic:   p.recoveryBpSystolic  ?? (Math.floor(Math.random() * 11) + 120),
      recoveryBpDiastolic:  p.recoveryBpDiastolic ?? (Math.floor(Math.random() * 16) + 70),
      recoveryHeartRate:    p.recoveryHeartRate   ?? (Math.floor(Math.random() * 31) + 60),
      recoverySpO2:         p.recoverySpO2        ?? (Math.floor(Math.random() * 5)  + 95),
      temperatureCelsius:   p.temperatureCelsius  ?? p.temperaturePostop ?? parseFloat((36 + Math.random()).toFixed(1)),
      recoveryBpUnobtainable:          p.recoveryBpUnobtainable          ?? false,
      recoveryHeartRateUnobtainable:   p.recoveryHeartRateUnobtainable   ?? false,
      recoverySpO2Unobtainable:        p.recoverySpO2Unobtainable        ?? false,
      recoveryTemperatureUnobtainable: p.recoveryTemperatureUnobtainable ?? false,
      painScoreNRS:       p.painScoreNRS,
      ponv:               p.ponv               ?? false,
      disposition:        p.disposition,
      dispositionNotes:   p.dispositionNotes   ?? "",
      handoverItems:      normaliseHandoverCodes(Array.isArray(p.handoverItems) ? p.handoverItems : []),
    }
  }, [])

  const totalFrom = useCallback((data: Partial<FormData>) => {
    return (
      (data.aldreteActivity ?? 0) +
      (data.aldreteRespiration ?? 0) +
      (data.aldreteCirculation ?? 0) +
      (data.aldreteConsciousness ?? 0) +
      (data.aldreteSpO2 ?? 0)
    )
  }, [])

  const payloadFrom = useCallback((data: FormData) => {
    const handoverAllowed = data.disposition === "WARD" || data.disposition === "PACU"
    return {
      ...data,
      handoverItems: handoverAllowed ? data.handoverItems : [],
      dispositionNotes: handoverAllowed ? data.dispositionNotes : "",
      aldreteTotal: totalFrom(data),
    }
  }, [totalFrom])

  const markSaveResult = useCallback((result: CasePatchResult, response?: CasePatchResponse) => {
    if (result === "saved") {
      baseUpdatedAtRef.current = response?.postopUpdatedAt ?? baseUpdatedAtRef.current
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setAutosaveState("saved")
    } else if (result === "queued" || result === "failed") {
      setAutosaveState("queued")
    }
  }, [])

  const persistPostop = useCallback(async (data: FormData, force = false): Promise<CasePatchResult> => {
    const payload = payloadFrom(data)
    const { result, response } = await saveCasePatchWithQueue(id, "postop", payload, force ? null : baseUpdatedAtRef.current)
    lastSavedJsonRef.current = JSON.stringify(payload)
    markSaveResult(result, response)
    return result
  }, [id, markSaveResult, payloadFrom])

  function overwriteWithMine() {
    Alert.alert(
      t("overwriteNewerTitle"),
      t("overwriteNewerMsg"),
      [
        { text: tc("cancelLabel"), style: "cancel" },
        {
          text: t("overwrite"),
          style: "destructive",
          onPress: async () => {
            setAutosaveState("saving")
            try {
              await persistPostop(schema.parse(getValues()), true)
            } catch (err) {
              Alert.alert(tc("errorLabel"), err instanceof Error ? err.message : t("couldNotOverwrite"))
              setAutosaveState("conflict")
            }
          },
        },
      ]
    )
  }

  async function reloadLatest() {
    setLoading(true)
    try {
      const c = await apiJson<CaseResponse>(`/api/cases/${id}`)
      const p = c.postop ?? {}
      const nextValues = valuesFromPostop(p)
      baseUpdatedAtRef.current = p.updatedAt ?? null
      lastSavedJsonRef.current = JSON.stringify(payloadFrom(nextValues))
      reset(nextValues)
      setAutosaveState("saved")
    } catch (err) {
      Alert.alert(tc("errorLabel"), err instanceof Error ? err.message : t("couldNotReload"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    apiJson<CaseResponse>(`/api/cases/${id}`)
      .then(async (c) => {
        const p = c.postop ?? {}
        const nextValues = valuesFromPostop(p)
        baseUpdatedAtRef.current = p.updatedAt ?? null
        lastSavedJsonRef.current = JSON.stringify(payloadFrom(nextValues))
        // Pre-populate dispositionNotes with continued-postop items if field is empty
        if (continuedItems && !nextValues.dispositionNotes) {
          const itemList = decodeURIComponent(continuedItems).split("|").filter(Boolean)
          if (itemList.length > 0) {
            nextValues.dispositionNotes = t("continuedPostop") + " " + itemList.join(", ")
          }
        }
        reset(nextValues)
        setFinalizedAt(c.finalizedAt ?? null)
        setCaseStatus(c.status ?? null)
        const queued = await flushQueuedCasePatch(id, "postop")
        markSaveResult(queued.result === "empty" ? "saved" : queued.result, queued.response)
      })
      .catch((err: Error) => Alert.alert(tc("errorLabel"), err.message))
      .finally(() => setLoading(false))
  }, [continuedItems, id, markSaveResult, payloadFrom, reset, t, tc, valuesFromPostop])

  useEffect(() => {
    if (loading) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)

    autosaveTimerRef.current = setTimeout(async () => {
      const parsed = schema.safeParse(getValues())
      if (!parsed.success) return
      const payload = payloadFrom(parsed.data)
      const nextJson = JSON.stringify(payload)
      if (nextJson === lastSavedJsonRef.current) return

      setAutosaveState("saving")
      try {
        await persistPostop(parsed.data)
      } catch (err) {
        setAutosaveState(err instanceof ApiError && err.status === 409 ? "conflict" : "error")
      }
    }, 900)

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [formValues, getValues, loading, persistPostop, payloadFrom])

  useLiveRefresh(async () => {
    const result = await flushQueuedCasePatch(id, "postop")
    if (result.result === "saved") markSaveResult(result.result, result.response)
  }, { enabled: !loading && autosaveState === "queued", intervalMs: 10_000 })

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      const result = await persistPostop(data)
      if (result === "saved") {
        router.replace(`/(app)/cases/${id}`)
      } else {
        Alert.alert(t("savedLocally"), t("savedLocallyMsg"))
      }
    } catch (err) {
      Alert.alert(tc("errorLabel"), err instanceof Error ? err.message : t("couldNotOverwrite"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenState title={t("loadingRecovery")} loading />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: tc("postopTitle"), headerShown: false }} />
      <AppHeader title={tc("postopTitle")} showNewCase={false} />
      {caseStatus === "COMPLETE" && finalizedAt && (
        <EditWindowBanner finalizedAt={finalizedAt} caseId={id} showBackButton />
      )}
      <TouchableOpacity
        onPress={() => router.replace(`/(app)/cases/intraop/${id}`)}
        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}
      >
        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>{t("backToIntraop")}</Text>
      </TouchableOpacity>
      {isWatching && <WatchingOverlay onTakeover={takeover} />}
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView style={{ paddingHorizontal: 20, paddingTop: 2 }} contentContainerStyle={{ paddingBottom: 80 }}>
          <RecoverySummary
            total={aldreteTotal}
            label={aldreteLabel}
            disposition={disposition}
            pain={painScoreNRS}
            ponv={ponv}
          />
          <Text style={{ color: autosaveState === "error" || autosaveState === "conflict" ? colors.danger : autosaveState === "queued" ? colors.warning : colors.textMuted, fontSize: 12, fontWeight: "800", marginTop: 2, marginBottom: 4, textAlign: "right" }}>
            {autosaveState === "saving"
              ? tc("autosaveSaving")
              : autosaveState === "queued"
              ? tc("autosaveQueued")
              : autosaveState === "conflict"
              ? tc("autosaveConflict")
              : autosaveState === "error"
              ? tc("autosaveError")
              : lastSavedAt
              ? `${t("savedAt")} ${lastSavedAt}`
              : tc("autosaveReady")}
          </Text>
          {autosaveState === "conflict" ? (
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
              <TouchableOpacity
                onPress={reloadLatest}
                style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.danger, paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "900" }}>{tc("reloadLatest")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={overwriteWithMine}
                style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.danger, backgroundColor: withAlpha(colors.danger, "18"), paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "900" }}>{tc("overwriteMine")}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* ── Modified Aldrete Score ─────────────────────────────── */}
          <SectionHeader title={tc("aldreteScore")} />

          {ALDRETE_CRITERIA.map((criterion) => (
            <View key={criterion.field} className="mb-4">
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 8 }}>{criterion.label}</Text>
              <Controller
                control={control}
                name={criterion.field}
                render={({ field: { onChange, value } }) => (
                  <ScoreRow
                    label={criterion.label}
                    value={value as number}
                    onChange={onChange}
                    descriptions={criterion.descriptions}
                  />
                )}
              />
            </View>
          ))}

          {/* ── Recovery vitals ────────────────────────────────────── */}
          <SectionHeader title={tc("recoveryVitals")} />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Controller control={control} name="recoveryBpSystolic" render={({ field }) => (
                <Controller control={control} name="recoveryBpUnobtainable" render={({ field: uto }) => (
                  <VitalNumber label={tc("sbpLabel")} unit="mmHg" value={field.value} onChange={field.onChange} min={recoveryBpSystolicRange?.min ?? 1} max={recoveryBpSystolicRange?.max ?? 300} step={recoveryBpSystolicRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
                )} />
              )} />
            </View>
            <View style={{ flex: 1 }}>
              <Controller control={control} name="recoveryBpDiastolic" render={({ field }) => (
                <Controller control={control} name="recoveryBpUnobtainable" render={({ field: uto }) => (
                  <VitalNumber label={tc("dbpLabel")} unit="mmHg" value={field.value} onChange={field.onChange} min={recoveryBpDiastolicRange?.min ?? 1} max={recoveryBpDiastolicRange?.max ?? 200} step={recoveryBpDiastolicRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
                )} />
              )} />
            </View>
          </View>

          <Controller control={control} name="recoveryHeartRate" render={({ field }) => (
            <Controller control={control} name="recoveryHeartRateUnobtainable" render={({ field: uto }) => (
              <VitalNumber label={tc("heartRateLabel")} unit="bpm" value={field.value} onChange={field.onChange} min={recoveryHeartRateRange?.min ?? 1} max={recoveryHeartRateRange?.max ?? 300} step={recoveryHeartRateRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
            )} />
          )} />

          <Controller control={control} name="recoverySpO2" render={({ field }) => (
            <Controller control={control} name="recoverySpO2Unobtainable" render={({ field: uto }) => (
              <VitalNumber label={tc("spO2Label")} unit="%" value={field.value} onChange={field.onChange} min={recoverySpo2Range?.min ?? 0} max={recoverySpo2Range?.max ?? 100} step={recoverySpo2Range?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
            )} />
          )} />

          <Controller control={control} name="temperatureCelsius" render={({ field }) => (
            <Controller control={control} name="recoveryTemperatureUnobtainable" render={({ field: uto }) => {
              const cv = convertedMeasurement("temperature", unitPrefs, field.value, field.onChange, recoveryTemperatureRange?.min ?? 0, recoveryTemperatureRange?.max ?? 45, recoveryTemperatureRange?.step ?? 0.1)
              return <VitalNumber label={tc("temperatureLabel")} unit={cv.unit} value={cv.value} onChange={cv.onChange} min={cv.min} max={cv.max} step={cv.step} precision={cv.precision || 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
            }} />
          )} />

          <Field label={tc("painNRS")}>
            <Controller
              control={control}
              name="painScoreNRS"
              render={({ field: { onChange, value } }) => (
                <NRSRow value={value} onChange={onChange} />
              )}
            />
          </Field>

          <Field label={tc("ponvLabel")}>
            <Controller
              control={control}
              name="ponv"
              render={({ field: { onChange, value } }) => (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: value ? colors.warning : colors.border, borderRadius: 14, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Switch
                    value={value}
                    onValueChange={onChange}
                    trackColor={{ false: colors.borderStrong, true: withAlpha(colors.warning, "66") }}
                    ios_backgroundColor={colors.borderStrong}
                    thumbColor="#fff"
                  />
                  <Text style={{ color: value ? colors.warning : colors.textSecondary, fontSize: 14, fontWeight: "800" }}>{value ? tc("ponvPresent") : tc("ponvAbsent")}</Text>
                </View>
              )}
            />
          </Field>

          {/* ── Disposition ────────────────────────────────────────── */}
          <SectionHeader title={tc("dispositionLabel")} />

          <View className="mb-4">
            <Controller
              control={control}
              name="disposition"
              render={({ field: { onChange, value } }) => (
                <DispositionPicker
                  value={value}
                  onChange={(next) => {
                    onChange(next)
                    if (next !== "WARD" && next !== "PACU") {
                      setValue("handoverItems", [], { shouldDirty: true })
                      setValue("dispositionNotes", "", { shouldDirty: true })
                    }
                  }}
                  wardLabel={tc("dispWard")}
                  pacuLabel={tc("dispPACU")}
                  icuLabel={tc("dispICU")}
                />
              )}
            />
          </View>

          {(disposition === "WARD" || disposition === "PACU") && (
          <Field label={tc("dispNotes")}>
            <Controller
              control={control}
              name="dispositionNotes"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  placeholderTextColor={colors.textMuted}
                  placeholder={t("handoverNotesPlaceholder")}
                  value={value ?? ""}
                  onChangeText={onChange}
                  multiline
                  style={{
                    minHeight: 92,
                    textAlignVertical: "top",
                    backgroundColor: colors.surface,
                    color: colors.textPrimary,
                    borderRadius: 14,
                    borderCurve: "continuous",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              )}
            />
          </Field>
          )}

          {/* ── Handover checklist ─────────────────────────────────── */}
          {(disposition === "WARD" || disposition === "PACU") && (
            <>
              <SectionHeader title={tc("handoverChecklist")} />
              <Controller
                control={control}
                name="handoverItems"
                render={({ field: { onChange, value } }) => (
                  <HandoverChecklist value={value ?? []} onChange={onChange} />
                )}
              />
            </>
          )}

          {/* ── Save ───────────────────────────────────────────────── */}
          <TouchableOpacity
            style={{
              backgroundColor: colors.success,
              borderRadius: 16,
              borderCurve: "continuous",
              paddingVertical: 15,
              alignItems: "center",
              marginTop: 22,
              borderWidth: 1,
              borderColor: withAlpha(colors.success, "99"),
              boxShadow: "0 12px 26px rgba(0, 0, 0, 0.32)",
            }}
            onPress={handleSubmit(onSubmit)}
            disabled={isWatching || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>{tc("continueToSummary")}</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}
