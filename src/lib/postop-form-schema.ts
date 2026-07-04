import { z } from "zod"

export const postopFormSchema = z.object({
  aldreteActivity: z.number().min(0).max(2).default(0),
  aldreteRespiration: z.number().min(0).max(2).default(0),
  aldreteCirculation: z.number().min(0).max(2).default(0),
  aldreteConsciousness: z.number().min(0).max(2).default(0),
  aldreteSpO2: z.number().min(0).max(2).default(0),
  recoveryBpSystolic: z.number().optional(),
  recoveryBpDiastolic: z.number().optional(),
  recoveryHeartRate: z.number().optional(),
  recoverySpO2: z.number().optional(),
  temperatureCelsius: z.number().optional(),
  painScoreNRS: z.number().min(0).max(10).optional(),
  ponv: z.boolean().default(false),
  recoveryBpUnobtainable: z.boolean().default(false),
  recoveryHeartRateUnobtainable: z.boolean().default(false),
  recoverySpO2Unobtainable: z.boolean().default(false),
  recoveryTemperatureUnobtainable: z.boolean().default(false),
  disposition: z.enum(["WARD", "PACU", "ICU"]).optional(),
  dispositionNotes: z.string().optional(),
  handoverItems: z.array(z.string()).default([]),
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
