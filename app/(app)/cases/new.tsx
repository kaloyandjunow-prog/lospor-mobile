import { useState } from "react"
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Switch, KeyboardAvoidingView, Platform,
} from "react-native"
import { useRouter, Stack } from "expo-router"
import { useForm, Controller } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { apiFetch } from "@/lib/api"

// ─── Schema (subset of preop — mobile essentials) ────────────────────────────

const schema = z.object({
  ageYears:         z.number({ error: "Required" }).min(0).max(120),
  sex:              z.enum(["MALE", "FEMALE", "OTHER"]),
  heightCm:         z.number().min(50).max(250).optional(),
  weightKg:         z.number().min(1).max(300).optional(),
  diagnosis:        z.string().min(1, "Required"),
  plannedProcedure: z.string().min(1, "Required"),
  asaScore:         z.enum(["I", "II", "III", "IV", "V", "VI"]),
  emergencySurgery: z.boolean(),
  bpSystolic:       z.number().min(40).max(300).optional(),
  bpDiastolic:      z.number().min(20).max(200).optional(),
  heartRate:        z.number().min(20).max(300).optional(),
  spO2:             z.number().min(50).max(100).optional(),
  mallampati:       z.enum(["I", "II", "III", "IV"]).optional(),
  teamNotes:        z.string().max(500).optional(),
})

type FormData = z.infer<typeof schema>

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="text-slate-300 text-sm mb-1">{label}</Text>
      {children}
      {error && <Text className="text-red-400 text-xs mt-1">{error}</Text>}
    </View>
  )
}

function StyledInput({ value, onChangeText, placeholder, keyboardType, ...rest }: any) {
  return (
    <TextInput
      className="bg-slate-800 text-white rounded-lg px-4 py-3 text-base"
      placeholderTextColor="#64748b"
      placeholder={placeholder}
      keyboardType={keyboardType ?? "default"}
      value={value}
      onChangeText={onChangeText}
      {...rest}
    />
  )
}

function SegmentedPicker<T extends string>({
  options, value, onChange,
}: { options: readonly T[]; value: T | undefined; onChange: (v: T) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          onPress={() => onChange(opt)}
          className={`px-3 py-1.5 rounded-lg border ${value === opt ? "bg-blue-500 border-blue-500" : "border-slate-600"}`}
        >
          <Text className={value === opt ? "text-white font-medium" : "text-slate-400"}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NewCaseScreen() {
  const router    = useRouter()
  const [saving, setSaving] = useState(false)

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { emergencySurgery: false, sex: "MALE", asaScore: "I" },
  })

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      const bmi = data.heightCm && data.weightKg
        ? parseFloat((data.weightKg / ((data.heightCm / 100) ** 2)).toFixed(1))
        : undefined

      const res = await apiFetch("/api/cases", {
        method: "POST",
        body: JSON.stringify({
          preop: {
            ...data,
            bmi,
            diagnoses:  [{ label: data.diagnosis }],
            procedures: [{ label: data.plannedProcedure }],
          },
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Save failed")
      }

      const { id } = await res.json()
      router.replace(`/(app)/cases/${id}`)
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Could not create case.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "New case" }} />
      <KeyboardAvoidingView
        className="flex-1 bg-slate-900"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView className="px-5 pt-4" contentContainerStyle={{ paddingBottom: 60 }}>

          {/* Demographics */}
          <Text className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-3">Demographics</Text>

          <Field label="Age (years)" error={errors.ageYears?.message}>
            <Controller control={control} name="ageYears" render={({ field: { onChange, value } }) => (
              <StyledInput
                keyboardType="numeric"
                placeholder="e.g. 65"
                value={value != null ? String(value) : ""}
                onChangeText={(t: string) => onChange(t === "" ? undefined : Number(t))}
              />
            )} />
          </Field>

          <Field label="Sex" error={errors.sex?.message}>
            <Controller control={control} name="sex" render={({ field: { onChange, value } }) => (
              <SegmentedPicker options={["MALE", "FEMALE", "OTHER"] as const} value={value} onChange={onChange} />
            )} />
          </Field>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Height (cm)">
                <Controller control={control} name="heightCm" render={({ field: { onChange, value } }) => (
                  <StyledInput keyboardType="numeric" placeholder="170" value={value != null ? String(value) : ""} onChangeText={(t: string) => onChange(t === "" ? undefined : Number(t))} />
                )} />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Weight (kg)">
                <Controller control={control} name="weightKg" render={({ field: { onChange, value } }) => (
                  <StyledInput keyboardType="numeric" placeholder="75" value={value != null ? String(value) : ""} onChangeText={(t: string) => onChange(t === "" ? undefined : Number(t))} />
                )} />
              </Field>
            </View>
          </View>

          {/* Surgery */}
          <Text className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-3 mt-2">Surgery</Text>

          <Field label="Diagnosis / ICD code" error={errors.diagnosis?.message}>
            <Controller control={control} name="diagnosis" render={({ field: { onChange, value } }) => (
              <StyledInput placeholder="e.g. Appendicitis" value={value} onChangeText={onChange} />
            )} />
          </Field>

          <Field label="Planned procedure" error={errors.plannedProcedure?.message}>
            <Controller control={control} name="plannedProcedure" render={({ field: { onChange, value } }) => (
              <StyledInput placeholder="e.g. Laparoscopic appendicectomy" value={value} onChangeText={onChange} />
            )} />
          </Field>

          <Field label="ASA Physical Status" error={errors.asaScore?.message}>
            <Controller control={control} name="asaScore" render={({ field: { onChange, value } }) => (
              <SegmentedPicker options={["I", "II", "III", "IV", "V", "VI"] as const} value={value} onChange={onChange} />
            )} />
          </Field>

          <Field label="Emergency surgery">
            <Controller control={control} name="emergencySurgery" render={({ field: { onChange, value } }) => (
              <View className="flex-row items-center gap-3">
                <Switch value={value} onValueChange={onChange} trackColor={{ true: "#ef4444" }} />
                <Text className="text-slate-400 text-sm">{value ? "Yes — emergency" : "No"}</Text>
              </View>
            )} />
          </Field>

          {/* Vitals */}
          <Text className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-3 mt-2">Pre-op vitals</Text>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="BP systolic">
                <Controller control={control} name="bpSystolic" render={({ field: { onChange, value } }) => (
                  <StyledInput keyboardType="numeric" placeholder="120" value={value != null ? String(value) : ""} onChangeText={(t: string) => onChange(t === "" ? undefined : Number(t))} />
                )} />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="BP diastolic">
                <Controller control={control} name="bpDiastolic" render={({ field: { onChange, value } }) => (
                  <StyledInput keyboardType="numeric" placeholder="80" value={value != null ? String(value) : ""} onChangeText={(t: string) => onChange(t === "" ? undefined : Number(t))} />
                )} />
              </Field>
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="HR (bpm)">
                <Controller control={control} name="heartRate" render={({ field: { onChange, value } }) => (
                  <StyledInput keyboardType="numeric" placeholder="70" value={value != null ? String(value) : ""} onChangeText={(t: string) => onChange(t === "" ? undefined : Number(t))} />
                )} />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="SpO₂ (%)">
                <Controller control={control} name="spO2" render={({ field: { onChange, value } }) => (
                  <StyledInput keyboardType="numeric" placeholder="98" value={value != null ? String(value) : ""} onChangeText={(t: string) => onChange(t === "" ? undefined : Number(t))} />
                )} />
              </Field>
            </View>
          </View>

          {/* Airway */}
          <Text className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-3 mt-2">Airway</Text>

          <Field label="Mallampati class">
            <Controller control={control} name="mallampati" render={({ field: { onChange, value } }) => (
              <SegmentedPicker options={["I", "II", "III", "IV"] as const} value={value} onChange={onChange} />
            )} />
          </Field>

          {/* Notes */}
          <Text className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-3 mt-2">Team notes</Text>

          <Field label="Notes (no patient names or IDs)">
            <Controller control={control} name="teamNotes" render={({ field: { onChange, value } }) => (
              <TextInput
                className="bg-slate-800 text-white rounded-lg px-4 py-3 text-base"
                placeholderTextColor="#64748b"
                placeholder="Equipment, positioning notes, etc."
                multiline
                numberOfLines={3}
                style={{ minHeight: 80, textAlignVertical: "top" }}
                value={value}
                onChangeText={onChange}
              />
            )} />
          </Field>

          {/* Submit */}
          <TouchableOpacity
            className="bg-blue-500 rounded-xl py-3.5 items-center mt-4"
            onPress={handleSubmit(onSubmit)}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text className="text-white font-semibold text-base">Save case</Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}
