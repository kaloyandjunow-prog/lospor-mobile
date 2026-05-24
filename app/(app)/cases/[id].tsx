import { useEffect, useState } from "react"
import { View, Text, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from "react-native"
import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import { apiFetch } from "@/lib/api"

type CaseDetail = {
  id: string
  caseCode: string
  status: string
  preop?: {
    ageYears?: number; sex?: string; heightCm?: number; weightKg?: number; bmi?: number
    diagnosis?: string; plannedProcedure?: string; asaScore?: string
    emergencySurgery?: boolean; comorbidities?: any[]; allergies?: boolean; latexAllergy?: boolean
    currentMedications?: any[]; bpSystolic?: number; bpDiastolic?: number
    heartRate?: number; spO2?: number; temperature?: number
    mallampati?: string; rcriScore?: number; apfelScore?: number; stopBangScore?: number
    labResults?: { test: string; value: string; unit: string }[]
    teamNotes?: string
  }
  intraop?: {
    monthYear?: string; techniques?: string[]; airwayDevices?: string[]
    volatileAgent?: string; positions?: string[]
    crystalloidsMl?: number; colloidsMl?: number; bloodMl?: number
    complications?: string
  }
  postop?: {
    aldreteTotal?: number; disposition?: string; painScoreNRS?: number
    dispositionNotes?: string
  }
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null
  return (
    <View className="flex-row justify-between py-1.5 border-b border-slate-700/50">
      <Text className="text-slate-400 text-sm flex-1">{label}</Text>
      <Text className="text-slate-100 text-sm flex-1 text-right">{String(value)}</Text>
    </View>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-2">{title}</Text>
      <View className="bg-slate-800 rounded-xl px-4 py-1">{children}</View>
    </View>
  )
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT:       "text-slate-400",
  IN_PROGRESS: "text-blue-400",
  COMPLETE:    "text-green-400",
}

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router  = useRouter()
  const [data, setData]     = useState<CaseDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(`/api/cases/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(() => Alert.alert("Error", "Could not load case."))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <View className="flex-1 bg-slate-900 justify-center items-center">
        <ActivityIndicator color="#3b82f6" />
      </View>
    )
  }

  if (!data) {
    return (
      <View className="flex-1 bg-slate-900 justify-center items-center px-6">
        <Text className="text-slate-400 text-base">Case not found.</Text>
      </View>
    )
  }

  const p = data.preop
  const i = data.intraop
  const o = data.postop

  return (
    <>
      <Stack.Screen options={{ title: data.caseCode }} />
      <ScrollView className="flex-1 bg-slate-900 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Status badge */}
        <View className="flex-row items-center mb-5">
          <Text className={`text-sm font-semibold ${STATUS_COLOUR[data.status] ?? "text-slate-400"}`}>
            {data.status.replace("_", " ")}
          </Text>
        </View>

        {/* Preoperative */}
        {p && (
          <Section title="Preoperative">
            <Row label="Diagnosis"    value={p.diagnosis} />
            <Row label="Procedure"    value={p.plannedProcedure} />
            <Row label="Emergency"    value={p.emergencySurgery ? "Yes" : undefined} />
            <Row label="Age"          value={p.ageYears ? `${p.ageYears} yr` : null} />
            <Row label="Sex"          value={p.sex} />
            <Row label="Height"       value={p.heightCm ? `${p.heightCm} cm` : null} />
            <Row label="Weight"       value={p.weightKg ? `${p.weightKg} kg` : null} />
            <Row label="BMI"          value={p.bmi?.toFixed(1)} />
            <Row label="ASA"          value={p.asaScore} />
            <Row label="Comorbidities" value={p.comorbidities?.map((c: any) => c.label).join(", ")} />
            <Row label="Allergies"    value={p.latexAllergy ? "Latex + other" : p.allergies ? "Yes" : null} />
            <Row label="Medications"  value={Array.isArray(p.currentMedications) ? p.currentMedications.map((m: any) => m.label).join(", ") : null} />
            <Row label="BP"           value={p.bpSystolic && p.bpDiastolic ? `${p.bpSystolic}/${p.bpDiastolic} mmHg` : null} />
            <Row label="HR"           value={p.heartRate ? `${p.heartRate} bpm` : null} />
            <Row label="SpO₂"         value={p.spO2 ? `${p.spO2}%` : null} />
            <Row label="Temp"         value={p.temperature ? `${p.temperature} °C` : null} />
            <Row label="Mallampati"   value={p.mallampati ? `Class ${p.mallampati}` : null} />
            <Row label="RCRI"         value={p.rcriScore != null ? String(p.rcriScore) : null} />
            <Row label="Apfel"        value={p.apfelScore != null ? String(p.apfelScore) : null} />
            <Row label="STOP-BANG"    value={p.stopBangScore != null ? String(p.stopBangScore) : null} />
          </Section>
        )}

        {/* Labs */}
        {p?.labResults && p.labResults.length > 0 && (
          <Section title="Laboratory">
            {p.labResults.map((r, idx) => (
              <Row key={idx} label={r.test} value={`${r.value} ${r.unit}`.trim()} />
            ))}
          </Section>
        )}

        {/* Intraoperative */}
        {i && (
          <Section title="Intraoperative">
            <Row label="Month / Year"  value={i.monthYear} />
            <Row label="Technique"     value={i.techniques?.join(", ")} />
            <Row label="Airway"        value={i.airwayDevices?.join(", ")} />
            <Row label="Volatile"      value={i.volatileAgent} />
            <Row label="Position"      value={i.positions?.join(", ")} />
            <Row label="Crystalloids"  value={i.crystalloidsMl ? `${i.crystalloidsMl} mL` : null} />
            <Row label="Colloids"      value={i.colloidsMl ? `${i.colloidsMl} mL` : null} />
            <Row label="Blood"         value={i.bloodMl ? `${i.bloodMl} mL` : null} />
            <Row label="Complications" value={i.complications} />
          </Section>
        )}

        {/* Postoperative */}
        {o && (
          <Section title="Postoperative">
            <Row label="Aldrete total" value={o.aldreteTotal != null ? `${o.aldreteTotal} / 10` : null} />
            <Row label="Pain (NRS)"    value={o.painScoreNRS != null ? String(o.painScoreNRS) : null} />
            <Row label="Disposition"   value={o.disposition} />
            <Row label="Notes"         value={o.dispositionNotes} />
          </Section>
        )}

        {/* Edit button — only for non-complete cases */}
        {data.status !== "COMPLETE" && (
          <TouchableOpacity
            className="bg-blue-500 rounded-xl py-3.5 items-center mt-2"
            onPress={() => router.push(`/(app)/cases/edit/${id}`)}
          >
            <Text className="text-white font-semibold">Continue editing</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  )
}
