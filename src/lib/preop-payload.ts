// Pure function — no React dependencies.
// Computes the normalised preop payload from raw form values,
// including derived fields (BMI, RCRI, Apfel, STOP-BANG).
// Used by both the new-case form and the offline flusher.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildPreopPayload(values: Record<string, any>): Record<string, any> {
  const h = values.heightCm as number | undefined
  const w = values.weightKg as number | undefined
  const bmi = h && w ? Number((w / ((h / 100) ** 2)).toFixed(1)) : undefined
  const computedBmi = bmi ?? (h && w ? w / ((h / 100) ** 2) : null)

  const rcriScore = [
    values.highRiskSurgery,
    values.rcriIschemicHeart,
    values.rcriCHF,
    values.rcriCVD,
    values.rcriInsulinDM,
    values.rcriCreatinine,
  ].filter(Boolean).length

  const apfelScore = [
    values.sex === "FEMALE",
    !values.smoking,
    values.apfelPONVHistory,
    values.apfelPostopOpioids,
  ].filter(Boolean).length

  const stopBangScore = [
    values.stopbangSnoring,
    values.stopbangTired,
    values.stopbangObserved,
    values.stopbangBP,
    computedBmi != null && computedBmi > 35,
    values.ageYears != null && values.ageYears > 50,
    values.stopbangNeck,
    values.sex === "MALE",
  ].filter(Boolean).length

  return {
    ...values,
    bmi,
    rcriScore,
    apfelScore,
    stopBangScore,
    diagnosis:        ((values.diagnoses ?? []) as { label?: string }[]).map(d => d.label ?? "").join("; "),
    plannedProcedure: ((values.procedures ?? []) as { label?: string }[]).map(p => p.label ?? "").join("; "),
  }
}
