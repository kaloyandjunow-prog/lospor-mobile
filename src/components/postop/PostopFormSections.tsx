import React, { useState } from "react"
import { View, Text, TouchableOpacity } from "react-native"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"

type HandoverGroup = {
  id: string
  title: string
  items: { v: string; label: string }[]
}

// Maps legacy mobile/web codes → canonical codes
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

export function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 10, marginTop: 20 }}>
      {title}
    </Text>
  )
}

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>{label}</Text>
      {children}
      {error && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  )
}

// 3-button row for 0 / 1 / 2 Aldrete scores
export function ScoreRow({
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
export function NRSRow({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
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
export function DispositionPicker({
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
export function HandoverChecklist({
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

export function RecoverySummary({
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

