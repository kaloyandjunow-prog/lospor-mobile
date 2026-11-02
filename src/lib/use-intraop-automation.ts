import { useCallback, useEffect, useMemo, useState } from "react"
import { AUTOMATION_GROUPS, automationGroupEnabled, DEFAULT_INTRAOP_AUTOMATION, parseIntraopAutomation, vitalQuestionsEnabled, type IntraopAutomationSettings } from "@lospor/core/intraop-automation"
import { suggestionFactsFromPreop, type SuggestionContext } from "@lospor/core/intraop-suggestions"
import type { LabResult } from "@lospor/core/labs"
import { preopAgeDays, type VitalQuestionContext, type VitalStatsTable } from "@lospor/core/vital-questions"
import { apiJson } from "@/lib/api"
import type { IntraopPreopSummary } from "@/lib/intraop-preop-summary"
import { usePreferences } from "@/lib/preferences-context"

/**
 * Intraoperative automation (10.1.0): what the hospital switched on in
 * Status, and the reading counts the vitals questions are measured against.
 * Off, or offline before the first read, nothing is asked -- the public demo
 * has no Status and stays off. Kept for the session once read, so a dropped
 * connection mid-case is not the hospital switching the questions off.
 */
type Automation = { settings: IntraopAutomationSettings; stats: VitalStatsTable | null }

let cached: Automation | null = null

export function parseIntraopAutomationResponse(value: unknown): Automation {
  const body = typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
  const settings = parseIntraopAutomation(body.settings)
  const stats = vitalQuestionsEnabled(settings) && typeof body.stats === "object" && body.stats !== null
    ? body.stats as VitalStatsTable
    : null
  return { settings, stats }
}

export function useIntraopAutomation(): Automation & { reload: () => Promise<void> } {
  const [automation, setAutomation] = useState<Automation>(cached ?? { settings: DEFAULT_INTRAOP_AUTOMATION, stats: null })
  const reload = useCallback(async () => {
    try {
      cached = parseIntraopAutomationResponse(await apiJson<unknown>("/api/intraop/automation"))
      setAutomation(cached)
    } catch {
      // Keep what was last read.
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { ...automation, reload }
}

/**
 * What the vitals questions need on this screen, or null when they are not
 * asked here: switched off, the patient's age unknown, or the case open on
 * another screen (watching mode) -- the screen that holds the case asks.
 */
export function useVitalQuestionContext(preop: IntraopPreopSummary | null, isWatching: boolean): VitalQuestionContext | null {
  const { settings, stats } = useIntraopAutomation()
  const { vitalEpisodeAutoLog, automationGroups } = usePreferences()
  const ageDays = preopAgeDays(preop ? { ageValue: preop.ageValue, ageUnit: preop.ageUnit, ageYears: preop.age, ageApproxDays: preop.ageApproxDays } : null)
  return useMemo(() => {
    if (isWatching || !vitalQuestionsEnabled(settings, automationGroups) || ageDays == null) return null
    return { settings, stats, ageDays, keepLogging: vitalEpisodeAutoLog }
  }, [isWatching, settings, stats, ageDays, vitalEpisodeAutoLog, automationGroups])
}

/** What the screen knows of the case beyond the preop record. */
export type SuggestionCaseFacts = {
  idealWeightKg?: number | null
  tofMonitor?: boolean
  labs?: readonly LabResult[]
  bloodLossMl?: number | null
  startedAt?: string | null
  endedAt?: string | null
}

/**
 * What the suggestions (10.2.0) need on this screen, or null when none are
 * asked: every group off (in Status, or by this clinician), or the case open
 * on another screen. "now" is left to the attention hook, which ticks.
 */
export function useSuggestionContext(preop: IntraopPreopSummary | null, facts: SuggestionCaseFacts, isWatching: boolean): Omit<SuggestionContext, "now"> | null {
  const { settings } = useIntraopAutomation()
  const { vitalEpisodeAutoLog, automationGroups } = usePreferences()
  const { idealWeightKg, tofMonitor, labs, bloodLossMl, startedAt, endedAt } = facts
  const base = useMemo(() => suggestionFactsFromPreop(preop ? {
    ageValue: preop.ageValue, ageUnit: preop.ageUnit, ageYears: preop.age, ageApproxDays: preop.ageApproxDays,
    weightKg: preop.weight, sex: preop.sex,
    malignantHyperthermiaHistory: preop.malignantHyperthermiaHistory, familyAnesthesiaProblems: preop.familyAnesthesiaProblems,
    latexAllergy: preop.latexAllergy, apfelScore: preop.apfelScore, apfelPONVHistory: preop.apfelPONVHistory,
    comorbidities: preop.comorbidities, currentMedications: preop.currentMedications,
  } : null, idealWeightKg), [preop, idealWeightKg])
  return useMemo(() => {
    if (isWatching || !AUTOMATION_GROUPS.some(group => automationGroupEnabled(settings, group, automationGroups))) return null
    return {
      settings, user: automationGroups, patient: base.patient, preop: base.preop,
      tofMonitor: tofMonitor === true, keepLogging: vitalEpisodeAutoLog,
      labs: labs ?? [], bloodLossMl: bloodLossMl ?? null, startedAt: startedAt ?? null, endedAt: endedAt ?? null,
    }
  }, [isWatching, settings, automationGroups, base, tofMonitor, vitalEpisodeAutoLog, labs, bloodLossMl, startedAt, endedAt])
}
