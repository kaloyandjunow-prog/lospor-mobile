import { useCallback, useRef, useState } from "react"
import * as Haptics from "expo-haptics"
import { notify } from "@/lib/notify"
import { usePreferences } from "@/lib/preferences-context"

type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

export type MonitoringValues = {
  bisValue: number | null
  tofRatio: number | null
  /** Always mmHg. The entry control converts if the clinician works in cmH2O. */
  cvpMmHg: number | null
}

const EMPTY: MonitoringValues = { bisValue: null, tofRatio: null, cvpMmHg: null }

/**
 * What the BIS, train-of-four and CVP monitors read.
 *
 * These save on change rather than on leaving the tab, which is how the
 * monitoring chips beside them already behave. It also matters for correctness:
 * unticking a monitor clears its value, and that clear has to reach the server
 * whether or not the clinician swipes away afterwards. A reading left behind by
 * a monitor the record says was not used is a contradiction, and the longer it
 * sits in the database the more likely something reads it.
 *
 * Values send `null` when cleared, never `undefined`. An undefined key is
 * dropped from the patch as "not mentioned", so the previous figure would
 * silently stand -- and here a stale BIS is worse than no BIS.
 */
export function useIntraopMonitoringValues(
  patchIntraopSection: PatchIntraopSection,
  errorLabel: string,
) {
  const { tc } = usePreferences()
  const [values, setValues] = useState<MonitoringValues>(EMPTY)
  const valuesRef = useRef<MonitoringValues>(EMPTY)

  /** Adopt the stored values without writing them back. */
  const hydrateMonitoringValues = useCallback((stored: Partial<MonitoringValues>) => {
    const next: MonitoringValues = {
      bisValue: stored.bisValue ?? null,
      tofRatio: stored.tofRatio ?? null,
      cvpMmHg: stored.cvpMmHg ?? null,
    }
    setValues(next)
    valuesRef.current = next
  }, [])

  const saveMonitoringValues = useCallback((patch: Partial<MonitoringValues>) => {
    // Optimistic, and read from the ref rather than from state: a clear fired
    // by unticking a monitor lands in the same tick as the toggle, and reading
    // stale state here would drop it.
    const next = { ...valuesRef.current, ...patch }
    valuesRef.current = next
    setValues(next)

    void patchIntraopSection(patch)
      .then(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      })
      .catch(() => {
        notify(errorLabel, tc("monitoringValueSaveFailed"))
      })
  }, [patchIntraopSection, errorLabel, tc])

  return { monitoringValues: values, hydrateMonitoringValues, saveMonitoringValues }
}
