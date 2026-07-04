import { z } from "zod"

export const preopFormSchema = z.object({
  ageYears: z.number({ error: "Required" }).min(0).max(149),
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
  mouthOpeningCm: z.number().min(0.5).max(10).optional(),
  thyromental: z.number().min(3).max(15).optional(),
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
  // Cross-field required checks mirroring the web app's validate() in
  // forms/PreopForm.tsx so mobile/PWA enforces the same gate before intraop.
  // These surface as inline field errors + an onInvalid jump instead of a
  // silent no-op (Alert is dead on react-native-web - see lib/notify.ts).
  .superRefine((d, ctx) => {
    if (!d.diagnoses?.length)
      ctx.addIssue({ code: "custom", path: ["diagnoses"], message: "At least one diagnosis is required" })
    if (!d.procedures?.length)
      ctx.addIssue({ code: "custom", path: ["procedures"], message: "At least one procedure is required" })
    if (!d.bpUnobtainable && (d.bpSystolic == null || d.bpDiastolic == null))
      ctx.addIssue({ code: "custom", path: ["bpSystolic"], message: "Blood pressure is required" })
    if (!d.heartRateUnobtainable && d.heartRate == null)
      ctx.addIssue({ code: "custom", path: ["heartRate"], message: "Heart rate is required" })
    if (!d.respiratoryRateUnobtainable && d.respiratoryRate == null)
      ctx.addIssue({ code: "custom", path: ["respiratoryRate"], message: "Respiratory rate is required" })
    if (!d.airwayUnobtainable && !d.mallampati)
      ctx.addIssue({ code: "custom", path: ["mallampati"], message: "Mallampati class is required" })
  })

export type PreopFormInput = z.input<typeof preopFormSchema>
export type PreopFormData = z.output<typeof preopFormSchema>

export type PreopSection =
  | "patient"
  | "case"
  | "history"
  | "meds"
  | "anamnesis"
  | "exam"
  | "airway"
  | "labs"
  | "risk"
