import { useCallback, useEffect, useMemo, useState } from "react"
import { DEFAULT_INTRAOP_AUTOMATION, parseIntraopAutomation, vitalQuestionsEnabled, type IntraopAutomationSettings } from "@lospor/core/intraop-automation"
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
  const { vitalEpisodeAutoLog } = usePreferences()
  const ageDays = preopAgeDays(preop ? { ageValue: preop.ageValue, ageUnit: preop.ageUnit, ageYears: preop.age, ageApproxDays: preop.ageApproxDays } : null)
  return useMemo(() => {
    if (isWatching || !vitalQuestionsEnabled(settings) || ageDays == null) return null
    return { settings, stats, ageDays, keepLogging: vitalEpisodeAutoLog }
  }, [isWatching, settings, stats, ageDays, vitalEpisodeAutoLog])
}
