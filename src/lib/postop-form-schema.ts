import { z } from "zod"
import {
  CLINICAL_NUMBER_RULES,
  validatePostopPatch,
} from "@lospor/core/clinical-validation"

const postopNumber = (field: string) => {
  const rule = CLINICAL_NUMBER_RULES.postop[field]
  if (!rule) throw new Error(`Missing Core number rule for postop.${field}`)
  return z.number().min(rule.min).max(rule.max)
}

export const postopFormSchema = z.object({
  aldreteActivity: postopNumber("aldreteActivity").default(0),
  aldreteRespiration: postopNumber("aldreteRespiration").default(0),
  aldreteCirculation: postopNumber("aldreteCirculation").default(0),
  aldreteConsciousness: postopNumber("aldreteConsciousness").default(0),
  aldreteSpO2: postopNumber("aldreteSpO2").default(0),
  recoveryBpSystolic: postopNumber("recoveryBpSystolic").optional(),
  recoveryBpDiastolic: postopNumber("recoveryBpDiastolic").optional(),
  recoveryHeartRate: postopNumber("recoveryHeartRate").optional(),
  recoverySpO2: postopNumber("recoverySpO2").optional(),
  temperatureCelsius: postopNumber("temperatureCelsius").optional(),
  painScoreNRS: postopNumber("painScoreNRS").optional(),
  ponv: z.boolean().default(false),
  recoveryBpUnobtainable: z.boolean().default(false),
  recoveryHeartRateUnobtainable: z.boolean().default(false),
  recoverySpO2Unobtainable: z.boolean().default(false),
  recoveryTemperatureUnobtainable: z.boolean().default(false),
  disposition: z.enum(["WARD", "PACU", "ICU"]).optional(),
  dispositionNotes: z.string().optional(),
  handoverItems: z.array(z.string()).default([]),
}).superRefine((data, ctx) => {
  for (const issue of validatePostopPatch(data).issues) {
    ctx.addIssue({
      code: "custom",
      path: issue.path,
      message: issue.code,
    })
  }
})

export type PostopFormInput = z.input<typeof postopFormSchema>
export type PostopFormData = z.output<typeof postopFormSchema>

const HANDOVER_CODE_ALIASES: Record<string, string> = {
  obs_q15: "obs_freq", obs_q30: "spo2_cont", obs_bp: "alert_bp", obs_temp: "temp_monitor",
  o2_therapy: "o2_supp", pain_regular: "analgesia_protocol", pain_pca: "pca",
  pain_threshold: "alert_pain", antiemetic: "antiemetic_prn", regular_meds: "resume_meds",
  dvt_chemical: "dvt_lmwh", pending_labs: "bloods", pending_imaging: "cxr",
  consult_request: "pain_team",
}

export function normaliseHandoverCodes(codes: string[]): string[] {
  return codes.map(code => HANDOVER_CODE_ALIASES[code] ?? code)
}
