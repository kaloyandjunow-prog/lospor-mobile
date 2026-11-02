import { useEffect, useMemo, useState } from "react"
import { likelyNext, successionContext, type LikelyEvent } from "@lospor/core/event-succession"
import { useIntraopAutomation } from "@/lib/use-intraop-automation"
import { usePreferences } from "@/lib/preferences-context"

/**
 * The events likely to come next on this case (10.2.0): at most two, only ones not yet charted, once the usual gap has
 * passed after the event they follow. Nothing when the reminders are off in Status or for this clinician, or the case
 * is open on another screen. What is likely, and why, is Core's (event-succession); this only hands it the case.
 */
export function useLikelyEvents({ log, techniques, child, enabled }: {
  log: ReadonlyArray<{ type: string; label?: string | null; ts: string }>
  techniques: readonly string[]
  child: boolean
  enabled: boolean
}): { likely: LikelyEvent[]; dismiss: (event: string) => void } {
  const { settings, succession } = useIntraopAutomation()
  const { automationGroups } = usePreferences()
  const [dismissed, setDismissed] = useState<string[]>([])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const likely = useMemo(() => {
    if (!enabled) return []
    return likelyNext({
      log: log.filter(event => event.type === "clinical_event").map(event => ({ label: event.label, ts: event.ts })),
      context: successionContext(techniques, child), links: succession, now, dismissed, settings, user: automationGroups,
    })
  }, [enabled, log, techniques, child, succession, now, dismissed, settings, automationGroups])
  return { likely, dismiss: (event: string) => setDismissed(current => (current.includes(event) ? current : [...current, event])) }
}
